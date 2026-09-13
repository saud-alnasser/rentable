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
	import { SETUP_STEPS, TURSO_DASHBOARD_URL, type SetupStep } from '$lib/organization/setup';
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
	 * **The walk ends inside the workspace.** Creating it on the third step is the workspace
	 * mutation, then the way in and the startup unit reading where the machine stands again, in
	 * that order: the shell signed the owner in as it created the organization, so the startup unit
	 * admits them, opens the one workspace and goes on in from the way in, the path a sign-in takes
	 * past the wall. The address changes first so the application draws under the way in rather
	 * than under this one, which the shell would otherwise keep.
	 */
	const startup = useStartup();

	let step = $state<SetupStep>('connect');
	let sessionId = $state<string | null>(null);

	const stateQuery = useFetchOrganizationState();
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

	const create = async (name: string, password: string) => {
		try {
			// the walk's `name` step does not collect a username yet; the field is ticket 15's, and
			// until it lands the router refuses the empty one before the host is reached.
			await createOrganization.mutateAsync({ name, username: '', password });
			step = 'workspace';
		} catch {
			// the refusal a person can act on has been shown verbatim; the form keeps what they
			// typed, because the failures that reach here are the ones a person retries.
		}
	};

	const createFirstWorkspace = async (name: string) => {
		try {
			await createWorkspace.mutateAsync({ name });
		} catch {
			// said by the shared handler; the surface keeps what they typed.
			return;
		}

		// the walk is over and the owner is in: the address goes to the way in first, and the
		// startup unit reads where the machine stands and goes on in from there.
		void goto(resolve(THE_WAY_IN));
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
	holdsTursoAuthority={stateQuery.data?.holdsTursoAuthority ?? false}
	isConnecting={beginConsent.isPending}
	isCreating={createOrganization.isPending || createWorkspace.isPending}
	onOpenDashboard={() => void tauri.opener.openUrl(TURSO_DASHBOARD_URL)}
	onConnect={() => void connect()}
	onDisconnect={() => void forget()}
	onContinue={next}
	onBack={back}
	onCreate={create}
	onCreateWorkspace={createFirstWorkspace}
/>
