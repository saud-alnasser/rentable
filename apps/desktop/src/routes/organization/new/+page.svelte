<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { tauri } from '$lib/platform/tauri';
	import OrganizationSetupWalk from '$lib/organization/component/setup-walk.svelte';
	import {
		useBeginConsent,
		useConnectExisting,
		useConsentResult,
		useCreateOrganization,
		useCreateWorkspace,
		useDisconnect,
		useFetchOrganizationState,
		useInspectGroup
	} from '$lib/organization/query';
	import {
		SETUP_STEPS,
		TURSO_DASHBOARD_URL,
		refusalAfterFailedConnect,
		refusalAfterFailedCreate,
		stepAfterConsent,
		stepFor,
		type SetupStep,
		type WalkRefusal
	} from '$lib/organization/setup';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { toErrorDetail, toErrorText } from '$lib/error/message';
	import { THE_WAY_IN } from '$lib/layout/shell-surface';
	import { useStartup } from '$lib/layout/startup-context';

	/**
	 * The first run's address, and the one that wires the walk to the shell.
	 *
	 * The screen is `organization/component/setup-walk.svelte`, drawn from props; what is here is
	 * every call that reaches Rust and the state each answers with: opening the consent, polling it,
	 * creating the organization, and handing the first workspace's creation to the loading pass. It
	 * opens with nobody signed in,
	 * which `layout/shell-surface.ts` decides, because it is how a person comes to be somebody here.
	 *
	 * **It reads where the machine stands before asking for a consent.** A machine that already
	 * holds Turso authority, because a person connected, went back to the wall and came here again,
	 * opens the walk at `connect` already granted rather than asking for a consent it has.
	 *
	 * **The consent is where the two ways part.** What the account already holds is read once
	 * after it, and the walk goes on to name an organization or to the step where the owner of the
	 * one that is there signs in (effort 828, requirement 14). A read that fails leaves the person
	 * on the consent step with the shared handler's sentence and the button still there.
	 *
	 * **A connect the organization refuses is said on its own step**, against the password, for
	 * the reason the group refusal is said beside its field: the sentence belongs where the typing
	 * happened. The one exception is a refusal nothing typed on the step can answer, one about the
	 * consented account itself, which is told apart by the code Rust gave it and returns to the
	 * consent. *Until 2026-09-20 that refusal was a machine somebody was still on, and until ticket
	 * 20 it was read off the authority rather than off the code.*
	 *
	 * **A create the group refuses sends the walk back to the consent.** One group holds one
	 * organization, so a group that already holds one is refused before anything is created and
	 * the authority is given back (requirement 21). This reads where the machine stands again
	 * after every failed create, and a machine that no longer holds the authority is one whose
	 * consent was abandoned: the walk returns to the first step carrying the refusal's own
	 * sentence, and the next consent can be granted over another group or another account.
	 *
	 * **A create Turso refuses over the group asks for the group.** That one leaves the consent
	 * where it is, so the walk stays on the name step and draws the field with what was already
	 * typed still in it, and the create that follows carries all four values.
	 * `organization/setup.ts` tells the two refusals apart by their reasons, and Turso's own account
	 * of the refusal is what the field keeps under its sentence, behind a disclosure.
	 *
	 * **That is also why this route says what a failed create failed at, rather than the shared
	 * handler.** The handler shows a thrown message as a toast, which is the loudest thing on the
	 * screen, and the group refusal is the one failure the walk answers with a step: the connect
	 * step foretold it and the field says what to type, so Turso's words belong under that field
	 * and nowhere else. Every other failure is said here exactly as the handler said it.
	 *
	 * **Every refusal said here is a sentence in the reader's language, with what the shell said
	 * behind a disclosure under it** (effort 832, requirement 23). The sentence comes from the
	 * refusal's reason; the words behind it are Rust's or Turso's, and are what a person would quote
	 * to somebody else.
	 *
	 * **The walk ends inside the workspace, and the owner is never asked to name it** (effort 832,
	 * requirement 18). Once the organization is created the startup unit is told where the machine
	 * stands changed, with a `prepare` that creates the first workspace, named after the
	 * organization, through the same mutation the no-workspace surface uses. The loading surface
	 * goes up at once and shows that as its first stage, so the walk hands over to exactly one
	 * loading pass: the shell signed the owner in as it created the organization, and the unit
	 * admits them, opens the workspace and goes on in, the path a sign-in takes past the wall. A
	 * create that fails is said by the mutation's handler, and the pass lands on the no-workspace
	 * surface, which offers the create again.
	 *
	 * **The address moves to the way in inside the `prepare`, and is waited for**, so the
	 * application draws under the way in rather than under this route, which the shell would
	 * otherwise keep. The loading surface is drawn over whichever address is current, so the move
	 * is not seen.
	 */
	const startup = useStartup();

	let step = $state<SetupStep>('connect');
	let sessionId = $state<string | null>(null);
	let refusal = $state<WalkRefusal | null>(null);
	let askGroup = $state(false);
	let groupDetail = $state<string | null>(null);
	let existingRefusal = $state<WalkRefusal | null>(null);
	let isHandingOver = $state(false);

	const stateQuery = useFetchOrganizationState();

	/** a refusal as the walk says it: the reader's sentence, and the shell's words behind it. */
	const said = (error: unknown): WalkRefusal => ({
		sentence: toErrorText(error, $LL),
		detail: toErrorDetail(error)
	});

	// the walk resumes where the machine stands, and `organization/setup.ts` decides what that
	// means: somebody already signed in has nothing left to ask here, since both steps would create
	// the organization again, and is sent to the way in rather than shown a step. A reload or an
	// address typed in reaches this route the same way, which is what makes the dev server's own
	// reload during a first run harmless. **Not while this walk is handing over**: its own create
	// signs the owner in, and the hand-over moves the address itself, under the loading surface.
	$effect(() => {
		if (isHandingOver) return;

		if (stepFor(stateQuery.data?.session) === 'leave') {
			void goto(resolve(THE_WAY_IN));
		}
	});
	const beginConsent = useBeginConsent();
	const consentResult = useConsentResult(() => sessionId);
	const disconnect = useDisconnect();
	// the shared handler says nothing about a failed create, because one of the failures it would
	// say is the one this walk answers on the surface; `create` below says the rest.
	const createOrganization = useCreateOrganization();
	// the first workspace is made for the owner rather than by them, so it is not announced: the
	// loading pass it is the first stage of is what they see. A failure is said as it is anywhere.
	const createWorkspace = useCreateWorkspace(undefined, {
		toast: { error: true, unexpected: () => $LL.common.messages.unexpectedError() }
	});
	const inspectGroup = useInspectGroup();
	// every refusal here is said on the step, so none of them is raised as a toast as well.
	const connectExisting = useConnectExisting();

	const consent = $derived.by(() => {
		if (!sessionId) return { status: 'idle' as const, error: null };

		const result = consentResult.data;

		if (!result) return { status: 'pending' as const, error: null };

		return { status: result.status, error: result.error };
	});

	const connect = async () => {
		try {
			const started = await beginConsent.mutateAsync();

			// whatever refused the last one is answered by starting another, which is what this is,
			// and that includes what Turso said about a group this consent may not even be over.
			refusal = null;
			groupDetail = null;
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

	/**
	 * the way on from the consent: ask the account what it already holds, and go where the answer
	 * says. A read that failed leaves the person where they are, with the handler's sentence.
	 */
	const goOn = async () => {
		try {
			step = stepAfterConsent(await inspectGroup.mutateAsync());
			existingRefusal = null;
		} catch {
			// said by the shared handler; the consent is granted and the button is still there.
		}
	};

	const connectToExisting = async (username: string, password: string) => {
		try {
			await connectExisting.mutateAsync({ username, password });
		} catch (error) {
			// read off what was refused rather than off where this machine stands: a refusal about
			// the consented account itself carries a reason nothing typed on this step answers, so
			// they go back to the consent. Everything else is said against the password on the step
			// they are on, with what they typed still in it. *This refetched the state and read the
			// Turso authority, so a connection that dropped at the wrong moment sent the person back
			// to grant a consent they still had.*
			const back = refusalAfterFailedConnect(error);

			if (!back) {
				existingRefusal = said(error);

				return;
			}

			sessionId = null;
			existingRefusal = null;
			refusal = said(error);
			step = back.step;

			return;
		}

		// the owner is in, on a machine that now holds the organization: the startup unit reads
		// where it stands from the way in, which is the path a sign-in takes past the wall.
		await goto(resolve(THE_WAY_IN));
		void startup.standingChanged();
	};

	const create = async (name: string, username: string, password: string, group: string | null) => {
		// held from the press until the loading surface is up, so the walk keeps its working surface
		// and the resume above does not move the address while the create signs the owner in.
		isHandingOver = true;

		try {
			await createOrganization.mutateAsync({ name, username, password, group });
		} catch (error) {
			isHandingOver = false;

			// the form keeps what they typed, because most of the failures that reach here are
			// the ones a person retries. Two are not, and `refusalAfterFailedCreate` tells them
			// apart: a group already holding an organization gave the authority back, so where
			// the machine stands is read again and decides, and a Turso that would take no group
			// asks for one here.
			const state = await stateQuery.refetch();
			const back = refusalAfterFailedCreate(error, state.data?.holdsTursoAuthority ?? false);

			if (back?.askGroup) {
				// the consent is untouched and so is what they typed: one more field appears on
				// the step they are already on, carrying Turso's account of why underneath it.
				// Said there and not in a toast, which the declaration keeps quiet for it.
				askGroup = true;
				groupDetail = back.detail;

				return;
			}

			if (!back) return;

			// the consent this walk polled is gone with the authority, so nothing is left to
			// report its old status from.
			sessionId = null;
			refusal = said(error);
			step = back.step;

			return;
		}

		// the owner is in, and the walk is over: the loading surface goes up now, and its first
		// stage makes the first workspace, named after the organization, while the address moves
		// to the way in. Both are done before the standing is read.
		void startup.standingChanged({
			prepare: () => Promise.all([createWorkspace.mutateAsync({ name }), goto(resolve(THE_WAY_IN))])
		});
	};

	const next = () => void goOn();

	/**
	 * the corner control: the wall from the first step, the step before from every other. Leaving
	 * with a consent still open in the browser abandons the poll and nothing else, since a consent
	 * creates nothing on the account.
	 */
	const back = () => {
		// the second step of the other way in, whose one step behind is the consent.
		if (step === 'existing') {
			existingRefusal = null;
			step = 'connect';

			return;
		}

		const index = SETUP_STEPS.indexOf(step);

		if (index <= 0) {
			void goto(resolve(THE_WAY_IN));

			return;
		}

		step = SETUP_STEPS[index - 1] ?? step;
	};
</script>

<OrganizationSetupWalk
	{step}
	{consent}
	{refusal}
	{askGroup}
	{groupDetail}
	{existingRefusal}
	holdsTursoAuthority={stateQuery.data?.holdsTursoAuthority ?? false}
	isConnecting={beginConsent.isPending || inspectGroup.isPending}
	isCreating={createOrganization.isPending || connectExisting.isPending || isHandingOver}
	onOpenDashboard={() => void tauri.opener.openUrl(TURSO_DASHBOARD_URL)}
	onConnect={() => void connect()}
	onDisconnect={() => void forget()}
	onContinue={next}
	onBack={back}
	onCreate={create}
	onConnectExisting={connectToExisting}
/>
