<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { tauri } from '$lib/platform/tauri';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { toErrorText } from '$lib/error/message';
	import { THE_WAY_IN } from '$lib/layout/shell-surface';
	import { useStartup } from '$lib/layout/startup-context';
	import OrganizationConnectScreen from '$lib/organization/component/connect-screen.svelte';
	import {
		afterRead,
		beginWith,
		inspectionFailed,
		joinBegun,
		joinFailed,
		normalizeLink,
		pasting,
		takeArrivingLink,
		THE_WALL,
		type JoinStep
	} from '$lib/organization/connect';

	/**
	 * The connect screen's address, and the one that wires it to the shell.
	 *
	 * The screen is `organization/component/connect-screen.svelte`, drawn from props, and its steps
	 * are `organization/connect.ts`, driven without a window. What is here is the calls that reach
	 * Rust, and what follows each: the way in, and the startup unit reading where the machine
	 * stands again, which raises the wall for a link that connected the machine and enters the
	 * application for an invitation that was accepted. It opens with nobody signed in, which
	 * `layout/shell-surface.ts` decides.
	 *
	 * **Read, then act on what the read said** (effort 828, requirements 1, 16 and 17). The form
	 * hands over the link and the code together, and the read is a decode: which organization the
	 * link names, which kind of link it is, and when it lapses, with no network behind it. What
	 * follows in the same wait is the act that kind of link names. A second machine's link is
	 * connected with the code, which unseals what reaches the organization, and ends at the wall,
	 * because the password that member already has is what admits them. An invitation is the one
	 * that asks for more, so it leaves the read on the password step and the accept runs when that
	 * is answered: it unseals, reaches, records the organization where this machine holds none,
	 * judges the row and opens the vault. *A third kind, the organization's own link, carried a
	 * legible credential and ran a connect of its own with no code; requirement 16 retired it, so
	 * there is no path through this screen that does not spend a code.*
	 *
	 * **The read is refused on the link and the act on the code.** Both can answer `invalidInput`,
	 * and the two mean different fields: text that is not a link, and a code nobody typed. So the
	 * decode and the act are caught apart, `inspectionFailed` marking the link field and
	 * `joinFailed` the code, and a person who mistyped one of the two is told which.
	 *
	 * **These are the host's commands and not the router's procedures**, as the inspection the
	 * connect replaced was. The screen branches on the Rust code of a refusal, and on the `reason`
	 * a `refused` carries beside it, and the router's caller wraps a rejection in its own error and
	 * keeps the code only on the cause; the host hands it over as it crossed.
	 * `organization/router.ts` carries `invitation.accept` for every other caller.
	 *
	 * **The link the operating system handed over is taken here, once.** The shell put it where
	 * `takeArrivingLink` reads it and navigated here; it lands in the field with the code still to
	 * type, and a mount with nothing waiting is a person who came from the wall, and gets an empty
	 * one.
	 */
	const startup = useStartup();

	let step = $state<JoinStep>(beginWith(takeArrivingLink()));

	// which connect is the one whose answer counts: the latest begun. A person can paste the same
	// link again while its first read is still out, and the first answer must not land over the
	// second wait.
	let attempt = 0;

	/** where every finished link ends: the shell reads where the machine stands and moves itself. */
	const standingChanged = () => {
		void goto(resolve(THE_WAY_IN));
		void startup.standingChanged();
	};

	/** what every refusal is said in: the shell's own sentence, in the reader's language. */
	const describe = (failure: unknown) =>
		toErrorText(failure, $LL, $LL.common.messages.unexpectedError());

	/**
	 * the connect opens the organization over the network and takes seconds, and the corner back is
	 * live while it does. A person who left for the form in the meantime is not moved when a
	 * refusal lands: it is written only over the wait it was asked for, and only by the latest
	 * attempt begun.
	 */
	const stillWaiting = (mine: number, link: string) =>
		mine === attempt && step.kind === 'reading' && step.link === link;

	const connect = async (link: string, code: string) => {
		const mine = ++attempt;
		const waiting: JoinStep = { kind: 'reading', link, code };

		step = waiting;

		let shape;

		try {
			shape = await tauri.organization.linkRead(link);
		} catch (error) {
			if (stillWaiting(mine, link)) {
				step = inspectionFailed(link, code, error, describe);
			}

			return;
		}

		try {
			// the kind of link that connects the machine itself: one a member made for this machine,
			// which carries the credential sealed and the code is the half that opens it.
			if (shape.kind === 'machine') {
				await tauri.organization.machineConnect(link, code);
			}
		} catch (error) {
			if (stillWaiting(mine, link)) {
				step = joinFailed(waiting, error, describe);
			}

			return;
		}

		// the organization is recorded on this machine whether or not the person waited for it, so
		// a link that connected it moves the shell whatever step is on screen: the address goes to
		// the way in first, and the startup unit raises the wall naming the organization.
		const landing = afterRead(link, code, shape);

		if (landing === THE_WALL) {
			standingChanged();

			return;
		}

		if (mine === attempt) {
			step = landing;
		}
	};

	/**
	 * the password an invited person chose, over the link and the code the form already took.
	 *
	 * The accept signs this person in, so where the machine stands afterwards carries a session and
	 * the startup unit opens the application on their first workspace. It leaves the way every
	 * other link does, because what changed is where this machine stands and the startup unit is
	 * what reads that.
	 */
	const join = async (link: string, code: string, password: string) => {
		const taking = step;

		if (taking.kind !== 'password') return;

		step = joinBegun(taking);

		try {
			await tauri.organization.invitation.accept(link, code, password);
		} catch (error) {
			step = joinFailed(step, error, describe);

			return;
		}

		standingChanged();
	};
</script>

<OrganizationConnectScreen
	{step}
	onConnect={(link, code) => void connect(normalizeLink(link), code)}
	onJoin={(link, code, password) => void join(link, code, password)}
	onSignIn={standingChanged}
	onBack={() => {
		// the form is the screen's first step, so from it back is the wall the person came from.
		// Every later step came from the form and returns to it, with what was typed still in it.
		if (step.kind === 'paste') {
			void goto(resolve(THE_WAY_IN));

			return;
		}

		step = pasting(step.link, step.kind === 'refused' ? '' : step.code);
	}}
/>
