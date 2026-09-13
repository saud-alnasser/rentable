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
		inspectionFailed,
		takeArrivingLink,
		type JoinStep
	} from '$lib/organization/join';
	import { onMount } from 'svelte';

	/**
	 * The connect screen's address, and the one that wires it to the shell.
	 *
	 * The screen is `organization/component/join-screen.svelte`, drawn from props, and its steps
	 * are `organization/join.ts`, driven without a window. What is here is the one call that
	 * reaches Rust, connecting by a link, and what follows it: the way in, and the startup unit
	 * reading where the machine stands again, which raises the wall naming the organization the
	 * link found. It opens with nobody signed in, which `layout/shell-surface.ts` decides.
	 *
	 * **The connect is the host's command and not the router's procedure**, as the inspection it
	 * replaces was. The screen branches on the Rust code of a refusal, `invalidInput` against
	 * `network`, and the router's caller wraps a rejection in its own error and keeps the code
	 * only on the cause; the host hands it over as it crossed.
	 *
	 * **The link the operating system handed over is taken here, once.** The shell put it where
	 * `takeArrivingLink` reads it and navigated here; a mount with nothing waiting is a person who
	 * came from the wall, and gets the field.
	 */
	const startup = useStartup();

	let step = $state<JoinStep>({ kind: 'paste' });

	// which connect is the one whose answer counts: the latest begun. A person can paste the same
	// link again while its first read is still out, and the first answer must not land over the
	// second wait.
	let attempt = 0;

	const connect = async (link: string) => {
		const mine = ++attempt;

		step = { kind: 'inspecting', link };

		try {
			await tauri.organization.connect(link);
		} catch (error) {
			// the connect opens the organization over the network and takes seconds, and the
			// corner back is live while it does. A person who left for the field in the meantime
			// is not moved when a refusal lands: it is written only over the wait it was asked
			// for, and only by the latest attempt begun.
			if (mine === attempt && step.kind === 'inspecting' && step.link === link) {
				step = inspectionFailed(link, error, (failure) =>
					toErrorText(failure, $LL, $LL.common.messages.unexpectedError())
				);
			}

			return;
		}

		// the organization is recorded on this machine whether or not the person waited for it,
		// so the shell reads where the machine stands whatever step is on screen: the address goes
		// to the way in first, and the startup unit raises the wall naming the organization.
		void goto(resolve(THE_WAY_IN));
		void startup.standingChanged();
	};

	const open = (link: string) => {
		const begun = beginWith(link);

		if (begun.kind === 'inspecting') {
			void connect(begun.link);
		} else {
			step = begun;
		}
	};

	onMount(() => {
		open(takeArrivingLink() ?? '');
	});
</script>

<OrganizationJoinScreen
	{step}
	onConnect={open}
	onBack={() => {
		// the field is the screen's first step, so from it, or from text that was not a link, back
		// is the wall the person came from. Every later step came from the field and returns to it.
		if (step.kind === 'paste' || step.kind === 'unreadable') {
			void goto(resolve(THE_WAY_IN));

			return;
		}

		step = { kind: 'paste' };
	}}
/>
