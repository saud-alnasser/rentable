<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { tauri, type OrganizationCreated } from '$lib/platform/tauri';
	import OrganizationSetupWalk from '$lib/organization/component/setup-walk.svelte';
	import {
		useBeginConsent,
		useConsentResult,
		useCreateOrganization,
		useDisconnect
	} from '$lib/organization/query';
	import { SETUP_STEPS, TURSO_DASHBOARD_URL, type SetupStep } from '$lib/organization/setup';
	import { THE_WAY_IN } from '$lib/layout/shell-surface';
	import { useStartup } from '$lib/layout/startup-context';

	/**
	 * The first run's address, and the one that wires the walk to the shell.
	 *
	 * The screen is `organization/component/setup-walk.svelte`, drawn from props; what is here is
	 * every call that reaches Rust and the state each answers with: opening the consent, polling it,
	 * creating the organization, and copying the link. It opens with nobody signed in, which
	 * `layout/shell-surface.ts` decides, because it is how a person comes to be somebody here.
	 */
	const startup = useStartup();

	let step = $state<SetupStep>('connect');
	let sessionId = $state<string | null>(null);
	let created = $state<OrganizationCreated | null>(null);
	let linkCopied = $state(false);

	const beginConsent = useBeginConsent();
	const consentResult = useConsentResult(() => sessionId);
	const disconnect = useDisconnect();
	const createOrganization = useCreateOrganization();

	const consent = $derived.by(() => {
		if (!sessionId) return { status: 'idle' as const, error: null };

		const result = consentResult.data;

		if (!result) return { status: 'pending' as const, error: null };

		return { status: result.status, error: result.error };
	});

	const connect = async () => {
		linkCopied = false;

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
			created = await createOrganization.mutateAsync({ name, password });
			step = 'done';
		} catch {
			// the refusal a person can act on has been shown verbatim; the form keeps what they
			// typed, because the failures that reach here are the ones a person retries.
		}
	};

	const copyLink = async () => {
		if (!created) return;

		try {
			await navigator.clipboard.writeText(created.joinLink);
			linkCopied = true;
		} catch {
			linkCopied = false;
		}
	};

	const next = () => {
		const index = SETUP_STEPS.indexOf(step);

		if (step === 'done') {
			// the walk is over and the owner is in: the shell signed them in as it created the
			// organization, and the startup unit reads where the machine stands again and goes on
			// in from the way in, which is the path a sign-in takes past the wall.
			void goto(resolve(THE_WAY_IN));
			void startup.standingChanged();

			return;
		}

		step = SETUP_STEPS[Math.min(index + 1, SETUP_STEPS.length - 1)] ?? step;
	};

	const back = () => {
		const index = SETUP_STEPS.indexOf(step);

		step = SETUP_STEPS[Math.max(index - 1, 0)] ?? step;
	};
</script>

<OrganizationSetupWalk
	{step}
	{consent}
	isConnecting={beginConsent.isPending}
	isCreating={createOrganization.isPending}
	{created}
	{linkCopied}
	onOpenDashboard={() => void tauri.opener.openUrl(TURSO_DASHBOARD_URL)}
	onConnect={() => void connect()}
	onDisconnect={() => void forget()}
	onContinue={next}
	onBack={back}
	onCreate={create}
	onCopyLink={() => void copyLink()}
/>
