<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { tauri } from '$lib/platform/tauri';
	import OrganizationSetupWalk from '$lib/organization/component/setup-walk.svelte';
	import {
		useBeginConsent,
		useConsentResult,
		useCreateOrganization,
		useCreateWorkspace,
		useDisconnect,
		useFetchOrganizationState
	} from '$lib/organization/query';
	import {
		SETUP_STEPS,
		TURSO_DASHBOARD_URL,
		refusalAfterFailedCreate,
		stepFor,
		type SetupStep
	} from '$lib/organization/setup';
	import { THE_WAY_IN } from '$lib/layout/shell-surface';
	import { useStartup } from '$lib/layout/startup-context';

	/**
	 * The first run's address, and the one that wires the walk to the shell.
	 *
	 * The screen is `organization/component/setup-walk.svelte`, drawn from props; what is here is
	 * every call that reaches Rust and the state each answers with: opening the consent, polling it,
	 * creating the organization, and creating the first workspace. It opens with nobody signed in,
	 * which `layout/shell-surface.ts` decides, because it is how a person comes to be somebody here.
	 *
	 * **It reads where the machine stands before asking for a consent.** A machine that already
	 * holds Turso authority, because a person connected, went back to the wall and came here again,
	 * opens the walk at `connect` already granted rather than asking for a consent it has.
	 *
	 * **A create the group refuses sends the walk back to the consent.** One group holds one
	 * organization, so a group that already holds one is refused before anything is created and
	 * the authority is given back (requirement 21). This reads where the machine stands again
	 * after every failed create, and a machine that no longer holds the authority is one whose
	 * consent was abandoned: the walk returns to the first step carrying the refusal's own
	 * sentence, and the next consent can be granted over another group or another account.
	 *
	 * **A create Turso refuses over the group asks for the group.** That one leaves the consent
	 * where it is, so the walk stays on the name step and draws the field, and the create that
	 * follows carries what was typed. `organization/setup.ts` tells the two refusals apart.
	 *
	 * **The walk ends inside the workspace.** Creating it on the third step is the workspace
	 * mutation, then the way in, and then the startup unit reading where the machine stands
	 * again: the shell signed the owner in as it created the organization, so the startup unit
	 * admits them, opens the one workspace and goes on in from the way in, the path a sign-in
	 * takes past the wall. **The navigation is awaited before the standing is read**, so the
	 * application draws under the way in rather than under this route, which the shell would
	 * otherwise keep; the walk stays on its working surface from the create until then.
	 */
	const startup = useStartup();

	let step = $state<SetupStep>('connect');
	let sessionId = $state<string | null>(null);
	let refusal = $state<string | null>(null);
	let askGroup = $state(false);
	let isHandingOver = $state(false);

	const stateQuery = useFetchOrganizationState();

	// the walk resumes where the machine stands, and `organization/setup.ts` decides what that
	// means: an owner already signed in whose organization holds no workspace is on the third
	// step, whatever this route was opened at, since the first two would create the organization
	// again. An owner who already holds a workspace is finished and is sent home rather than
	// shown a step. A reload or an address typed in reaches this route the same way, which is
	// what makes the dev server's own reload during a first run harmless.
	$effect(() => {
		const going = stepFor(stateQuery.data?.session);

		if (going === 'workspace' && step !== 'workspace') {
			step = 'workspace';
		}

		if (going === 'leave') {
			void goto(resolve(THE_WAY_IN));
		}
	});
	const beginConsent = useBeginConsent();
	const consentResult = useConsentResult(() => sessionId);
	const disconnect = useDisconnect();
	const createOrganization = useCreateOrganization();
	const createWorkspace = useCreateWorkspace();

	const consent = $derived.by(() => {
		if (!sessionId) return { status: 'idle' as const, error: null };

		const result = consentResult.data;

		if (!result) return { status: 'pending' as const, error: null };

		return { status: result.status, error: result.error };
	});

	const connect = async () => {
		try {
			const started = await beginConsent.mutateAsync();

			// whatever refused the last one is answered by starting another, which is what this is.
			refusal = null;
			sessionId = started.sessionId;
			await tauri.opener.openUrl(started.authorizationUrl);
		} catch {
			// the shared handler has already said what went wrong, and the button is still there.
		}
	};

	const forget = async () => {
		try {
			await disconnect.mutateAsync();
			sessionId = null;
		} catch {
			// said by the shared handler.
		}
	};

	const create = async (name: string, username: string, password: string, group: string | null) => {
		try {
			await createOrganization.mutateAsync({ name, username, password, group });
			step = 'workspace';
		} catch (error) {
			// the refusal a person can act on has been shown verbatim; the form keeps what they
			// typed, because most of the failures that reach here are the ones a person retries.
			// Two are not, and `refusalAfterFailedCreate` tells them apart: a group already
			// holding an organization gave the authority back, so where the machine stands is
			// read again and decides, and a Turso that would take no group asks for one here.
			const state = await stateQuery.refetch();
			const back = refusalAfterFailedCreate(error, state.data?.holdsTursoAuthority ?? false);

			if (!back) return;

			if (back.askGroup) {
				// the consent is untouched and so is what they typed: one more field appears on
				// the step they are already on.
				askGroup = true;

				return;
			}

			// the consent this walk polled is gone with the authority, so nothing is left to
			// report its old status from.
			sessionId = null;
			refusal = back.message;
			step = back.step;
		}
	};

	const createFirstWorkspace = async (name: string) => {
		// the walk keeps its working surface from here until the way in has it, so the form does
		// not come back for the moment between the workspace existing and the address changing.
		isHandingOver = true;

		try {
			await createWorkspace.mutateAsync({ name });
		} catch {
			// said by the shared handler; the surface keeps what they typed.
			isHandingOver = false;

			return;
		}

		// the walk is over and the owner is in: the address goes to the way in and is waited for,
		// and only then does the startup unit read where the machine stands. Told first, it would
		// put the loading surface up under this route and the walk would be what the application
		// redraws itself over.
		await goto(resolve(THE_WAY_IN));
		void startup.standingChanged();
	};

	const next = () => {
		const index = SETUP_STEPS.indexOf(step);

		step = SETUP_STEPS[Math.min(index + 1, SETUP_STEPS.length - 1)] ?? step;
	};

	/**
	 * the corner control: the wall from the first step, the step before from every other. Leaving
	 * with a consent still open in the browser abandons the poll and nothing else, since a consent
	 * creates nothing on the account.
	 */
	const back = () => {
		const index = SETUP_STEPS.indexOf(step);

		if (index <= 0) {
			void goto(resolve(THE_WAY_IN));

			return;
		}

		// the third step draws no corner, and this holds even if one is pressed: the name step
		// created the organization and signed the owner in, and nothing behind it can be re-entered.
		if (step === 'workspace') return;

		step = SETUP_STEPS[index - 1] ?? step;
	};
</script>

<OrganizationSetupWalk
	{step}
	{consent}
	{refusal}
	{askGroup}
	holdsTursoAuthority={stateQuery.data?.holdsTursoAuthority ?? false}
	isConnecting={beginConsent.isPending}
	isCreating={createOrganization.isPending || createWorkspace.isPending || isHandingOver}
	onOpenDashboard={() => void tauri.opener.openUrl(TURSO_DASHBOARD_URL)}
	onConnect={() => void connect()}
	onDisconnect={() => void forget()}
	onContinue={next}
	onBack={back}
	onCreate={create}
	onCreateWorkspace={createFirstWorkspace}
/>
