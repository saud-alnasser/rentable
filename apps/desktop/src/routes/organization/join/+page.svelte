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
		afterConnect,
		beginWith,
		inspectionFailed,
		joinBegun,
		joinFailed,
		takeArrivingLink,
		THE_WALL,
		type JoinStep
	} from '$lib/organization/join';
	import { onMount } from 'svelte';

	/**
	 * The connect screen's address, and the one that wires it to the shell.
	 *
	 * The screen is `organization/component/join-screen.svelte`, drawn from props, and its steps
	 * are `organization/join.ts`, driven without a window. What is here is the three calls that
	 * reach Rust, and what follows each: the way in, and the startup unit reading where the machine
	 * stands again, which raises the wall for an organization link and enters the application for
	 * an invitation that was accepted. It opens with nobody signed in, which
	 * `layout/shell-surface.ts` decides.
	 *
	 * **Read, record, then judge.** The inspect says which organization the link names and where an
	 * invitation half stands; the connect records the organization; the standing decides what the
	 * screen shows. The connect runs on either kind of link and before the standing is judged for
	 * two reasons: `invitation_accept` refuses a machine that holds no organization, so recording
	 * it is what makes an invitation openable at all, and a link that was already opened still
	 * names the organization, which is how a person setting up a second machine reaches the wall
	 * rather than a dead end. A connect whose link names the organization this machine already
	 * holds answers where the machine stands instead of refusing, so a reset link opened at the
	 * wall passes straight through it.
	 *
	 * **These are the host's commands and not the router's procedures**, as the inspection the
	 * connect replaced was. The screen branches on the Rust code of a refusal, `invalidInput`
	 * against `network` against `preconditionFailed`, and the router's caller wraps a rejection in
	 * its own error and keeps the code only on the cause; the host hands it over as it crossed.
	 * `organization/router.ts` carries `invitation.accept` for every other caller.
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

	/** where every finished link ends: the shell reads where the machine stands and moves itself. */
	const standingChanged = () => {
		void goto(resolve(THE_WAY_IN));
		void startup.standingChanged();
	};

	const connect = async (link: string) => {
		const mine = ++attempt;

		step = { kind: 'inspecting', link };

		try {
			const facts = await tauri.organization.linkInspect(link);

			await tauri.organization.connect(link);

			// the organization is recorded on this machine whether or not the person waited for it,
			// so an organization link moves the shell whatever step is on screen: the address goes
			// to the way in first, and the startup unit raises the wall naming the organization.
			const landing = afterConnect(link, facts);

			if (landing === THE_WALL) {
				standingChanged();

				return;
			}

			if (mine === attempt) {
				step = landing;
			}
		} catch (error) {
			// the inspect and the connect each open the organization over the network and take
			// seconds, and the corner back is live while they do. A person who left for the field in
			// the meantime is not moved when a refusal lands: it is written only over the wait it was
			// asked for, and only by the latest attempt begun.
			if (mine === attempt && step.kind === 'inspecting' && step.link === link) {
				step = inspectionFailed(link, error, (failure) =>
					toErrorText(failure, $LL, $LL.common.messages.unexpectedError())
				);
			}
		}
	};

	const join = async (link: string, password: string) => {
		if (step.kind !== 'password') return;

		step = joinBegun(step);

		try {
			await tauri.organization.invitation.accept(link, password);
		} catch (error) {
			step = joinFailed(step, error, (failure) =>
				toErrorText(failure, $LL, $LL.common.messages.unexpectedError())
			);

			return;
		}

		// the accept signed this person in, so where the machine stands now carries a session and
		// the startup unit opens the application on their first workspace rather than the wall.
		standingChanged();
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
	onJoin={(link, password) => void join(link, password)}
	onSignIn={standingChanged}
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
