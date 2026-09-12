<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { tauri } from '$lib/platform/tauri';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { toErrorText } from '$lib/error/message';
	import { THE_WAY_IN } from '$lib/layout/shell-surface';
	import { useStartup } from '$lib/layout/startup-context';
	import OrganizationJoinScreen from '$lib/organization/component/join-screen.svelte';
	import {
		beginWith,
		inspected,
		inspectionFailed,
		takeArrivingLink,
		type JoinStep
	} from '$lib/organization/join';
	import { onMount } from 'svelte';

	/**
	 * The join screen's address, and the one that wires it to the shell.
	 *
	 * The screen is `organization/component/join-screen.svelte`, drawn from props, and its steps
	 * are `organization/join.ts`, driven without a window. What is here is the two calls that reach
	 * Rust: reading a link, and joining with a password, which is the startup unit's because it is
	 * a way through the wall and ends where a sign-in ends. It opens with nobody signed in, which
	 * `layout/shell-surface.ts` decides.
	 *
	 * **The link the operating system handed over is taken here, once.** The shell put it where
	 * `takeArrivingLink` reads it and navigated here; a mount with nothing waiting is a person who
	 * came from the sign-in card, and gets the field.
	 */
	const startup = useStartup();

	let step = $state<JoinStep>({ kind: 'paste' });
	let shell = $state(startup.snapshot);
	// what the last join here said, and only here: the unit's error is the wall's and may be a
	// wrong password typed on the sign-in card before the person came this way.
	let refusal = $state<string | null>(null);

	// which inspection is the one whose answer counts: the latest begun. A person can paste the
	// same link again while its first inspection is still out, and the first answer must not land
	// over the second wait.
	let inspection = 0;

	const inspect = async (link: string) => {
		const mine = ++inspection;

		step = { kind: 'inspecting', link };

		let next: JoinStep;

		try {
			next = inspected(link, await tauri.organization.linkInspect(link));
		} catch (error) {
			next = inspectionFailed(link, error, (failure) =>
				toErrorText(failure, $LL, $LL.common.messages.unexpectedError())
			);
		}

		// the inspection opens the organization over the network and takes seconds, and the corner
		// back is live while it does. A person who left for the field in the meantime is not moved
		// forward again when the answer lands: it is written only over the wait it was asked for,
		// and only by the latest inspection begun.
		if (mine === inspection && step.kind === 'inspecting' && step.link === link) {
			step = next;
		}
	};

	const open = (link: string) => {
		const begun = beginWith(link);

		refusal = null;

		if (begun.kind === 'inspecting') {
			void inspect(begun.link);
		} else {
			step = begun;
		}
	};

	const join = async (link: string, password: string) => {
		refusal = null;

		if (await startup.joinByLink(link, password)) {
			// the person is in; where they land next is the shell's, from the way in.
			void goto(resolve(THE_WAY_IN));

			return;
		}

		refusal = startup.snapshot.error;
	};

	const restoreFrom = async (link: string, email: string, password: string) => {
		refusal = null;

		if (await startup.restoreByLink(link, email, password)) {
			void goto(resolve(THE_WAY_IN));

			return;
		}

		refusal = startup.snapshot.error;
	};

	onMount(() => {
		const stopObserving = startup.observe((snapshot) => {
			shell = snapshot;
		});

		open(takeArrivingLink() ?? '');

		return stopObserving;
	});
</script>

<OrganizationJoinScreen
	{step}
	isJoining={shell.isSigningIn}
	errorMessage={refusal}
	onOpenLink={open}
	onJoin={(link, password) => void join(link, password)}
	onRestore={(link, email, password) => void restoreFrom(link, email, password)}
	onBack={() => {
		// the field is the screen's first step, so from it, or from text that was not a link, back
		// is the wall the person came from. Every later step came from the field and returns to it,
		// with nothing the last join said carried along.
		if (step.kind === 'paste' || step.kind === 'unreadable') {
			void goto(resolve(THE_WAY_IN));

			return;
		}

		refusal = null;
		step = { kind: 'paste' };
	}}
	onSignInInstead={() => void goto(resolve(THE_WAY_IN))}
/>
