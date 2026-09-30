<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { dropLandingOnNavigation } from '$lib/create/ui';
	import { locale } from '$lib/i18n/i18n-svelte';
	import { localesMetadata } from '$lib/platform/locale';
	import { trustWorkspaceData } from '$lib/mutation';
	import { linkArrived } from '$lib/organization';
	import { useCreateWorkspace } from '$lib/organization/ui';
	import type { OrganizationHost } from '$lib/organization';
	import { listenForWindowCloseRequests } from '$lib/platform/window';
	import type { PlaceAddress } from '$lib/feature/surface';
	import type { SettingsHost } from '$lib/settings';
	import { listenForSessionEnded, listenForSignOut, startWorkspaceSyncManager } from '$lib/sync';
	import type { SyncHost } from '$lib/sync';
	import { useEarlierRecords } from '$lib/workspace/ui';
	import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query';
	import { getCurrentWindow } from '@tauri-apps/api/window';
	import { onMount, untrack, type Snippet } from 'svelte';
	import { browserStartupPorts } from '../browser';
	import { provideStartup } from '../context';
	import { startupSurfaceBeforeLocale } from '../gate';
	import { noteMigration } from '../migration-notice.svelte';
	import {
		THE_FIRST_RUN,
		THE_JOIN,
		addressAfterSignOut,
		addressAfterSwitch,
		startupScreen,
		wayInFrom,
		type SwitchCrumb
	} from '../screen';
	import { createStartup } from '../startup';
	import StartupError from './error.svelte';
	import StartupLoading from './loading.svelte';
	import StartupNoWorkspace from './no-workspace.svelte';
	import StartupRecovery from './recovery.svelte';
	import StartupSignIn from './sign-in.svelte';
	import StartupSwitching from './switching.svelte';
	import StartupUnreadable from './unreadable.svelte';

	/** what the window is handed to draw a running application's state in. */
	type WindowProps = {
		queryClient: QueryClient;
		currentDirection: 'ltr' | 'rtl';
		shell: 'bare' | 'signed-out' | 'full';
		onWayIn: () => void;
		/** another workspace was chosen, with the shell's trail of places to move a record's page by. */
		onSwitchWorkspace: (
			workspaceId: string,
			trailOf: (routeId: string) => readonly SwitchCrumb<PlaceAddress>[]
		) => void;
		dialogs: boolean;
		children: Snippet;
	};

	let {
		host,
		shellWindow,
		bareFrame,
		children
	}: {
		/**
		 * the organization's, settings' and sync's ports, off the host the composition root composes
		 * (`$lib/app/host`), since each is a feature's and startup reaches no feature's adapter.
		 */
		host: { organization: OrganizationHost; settings: SettingsHost; sync: SyncHost };
		/**
		 * the shell's window once a locale exists, drawn around what this state puts inside the
		 * frame: the root layout hands over `shell/component/window.svelte`, since startup cannot
		 * import the shell that draws it.
		 */
		shellWindow: Snippet<[WindowProps]>;
		/** the bare frame, for the one screen drawn before a locale exists. */
		bareFrame: Snippet<[Snippet]>;
		/** the routed page, drawn once the application is running. */
		children?: Snippet;
	} = $props();

	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				retry: false,
				refetchOnWindowFocus: false
			}
		}
	});
	trustWorkspaceData(queryClient);

	/**
	 * THE ROOT
	 *
	 * Everything the application does between the process starting and a person being able to use
	 * it lives in `../startup`, which is a plain unit a `node:test` drives with no window.
	 *
	 * What is left here is the wiring around it: mirroring what that unit reports into something
	 * this file can render from, listening for what the shell and the other features say while the
	 * application runs, deciding how much of the shell each state draws, and drawing it inside the
	 * window the root layout hands over. *It was `routes/+layout.svelte` until effort 840's ticket
	 * 34 left the route composing and nothing else.*
	 */
	// the host is the composition root's one binding, handed over once; the unit is built on it once.
	const startup = createStartup(
		browserStartupPorts(
			queryClient,
			untrack(() => host)
		)
	);

	provideStartup(startup);

	// a create's request to be brought into view belongs to the screen it was made on, so the
	// next navigation drops it ([[rules/interface]], *Guidance*).
	dropLandingOnNavigation();

	// the one reactive thing. The unit is a plain object with observers, because a runes file
	// cannot be imported by a `node:test` at all, and being testable is the point of it.
	let shellState = $state(startup.snapshot);

	const currentDirection = $derived(localesMetadata[$locale].direction);

	const DAY_CROSSING_CHECK_INTERVAL_MS = 60_000;

	/**
	 * the first workspace, created from the no-workspace surface. The mutation is the owner's and
	 * the shell refuses anybody else; once it answers, startup reads where the machine stands and
	 * goes on in, which is the same path a sign-in takes past the wall.
	 *
	 * The client is handed in rather than read from context: this script runs above the
	 * `QueryClientProvider` the window draws, so there is no context here to read, and reading it
	 * is what failed startup before the window was shown.
	 */
	const createWorkspace = useCreateWorkspace(queryClient);
	// the records an earlier version left on this machine, which the way in mentions in one line
	// until they are brought in or dismissed (effort 838, requirement 18).
	const earlier = useEarlierRecords(queryClient);

	const createFirstWorkspace = async (name: string) => {
		try {
			await createWorkspace.mutateAsync({ name });
		} catch {
			// said by the shared handler; the surface keeps what they typed.
			return;
		}

		await startup.standingChanged();
	};

	onMount(() => {
		const stopObserving = startup.observe((snapshot) => {
			shellState = snapshot;
		});
		const appWindow = getCurrentWindow();
		let unlistenCloseRequested: (() => void) | undefined;
		let stopListeningForCloseRequests: (() => void) | undefined;
		// somebody ended this member's sessions from another machine: the shell has already
		// dropped the keys, so reading where the machine stands is what raises the wall, the
		// same path a sign-out takes (effort 826, requirement 22), and it leaves the three
		// addresses that open signed out first for the same reason the sign-out does below.
		const sessionEnded = async () => {
			const destination = addressAfterSignOut(page.url.pathname);

			if (destination) {
				await goto(resolve(destination));
			}

			await startup.standingChanged();
		};
		const stopWorkspaceSyncManager = startWorkspaceSyncManager({
			onResult: (detail) => startup.applySyncOutcome(detail),
			onSessionEnded: sessionEnded
		});
		const stopListeningForSessionEnded = listenForSessionEnded(() => void sessionEnded());
		// leaving first, and reading where the machine stands afterwards. The wall is drawn in place
		// of the route, so on the three addresses that open signed out there is no wall to draw and
		// signing out from `/settings` left the settings of a machine nobody is signed in on still
		// on screen. `addressAfterSignOut` says where to go, and it says nothing from anywhere else,
		// which is what keeps the reader's place on every address the card covers by itself.
		const stopListeningForSignOut = listenForSignOut(() => {
			void (async () => {
				const destination = addressAfterSignOut(page.url.pathname);

				if (destination) {
					await goto(resolve(destination));
				}

				await startup.signOut();
			})();
		});
		// a `rentable://` link the operating system handed the process: held where the join screen
		// takes it, and the screen put on. The one it was launched with is taken once the shell is
		// up, because it arrived before anything was listening; every later one is an event.
		let unlistenLink: (() => void) | undefined;
		let unlistenMigration: (() => void) | undefined;
		const openConnectScreen = (link: string) => {
			linkArrived(link);
			void goto(resolve(THE_JOIN));
		};
		const dayCrossingInterval = setInterval(() => {
			void startup.reconcileOnDayCrossing();
		}, DAY_CROSSING_CHECK_INTERVAL_MS);

		void (async () => {
			unlistenCloseRequested = await appWindow.onCloseRequested(async (event) => {
				if (startup.isClosing) {
					return;
				}

				event.preventDefault();
				await startup.closeWindow(startup.closesWithoutSyncing);
			});

			stopListeningForCloseRequests = listenForWindowCloseRequests(() => {
				void startup.closeWindow(startup.closesWithoutSyncing);
			});

			unlistenLink = await host.organization.onLink(openConnectScreen);
			unlistenMigration = await host.organization.onMigration(noteMigration);

			await startup.start();

			const waiting = await host.organization.linkTake();

			if (waiting) {
				openConnectScreen(waiting);
			}
		})();

		return () => {
			clearInterval(dayCrossingInterval);
			stopWorkspaceSyncManager();
			stopListeningForSignOut();
			stopListeningForSessionEnded();
			stopObserving();
			unlistenCloseRequested?.();
			stopListeningForCloseRequests?.();
			unlistenLink?.();
			unlistenMigration?.();
		};
	});

	$effect(() => {
		if (!shellState.isI18nReady || typeof document === 'undefined') {
			return;
		}

		document.documentElement.lang = $locale;
		document.documentElement.dir = currentDirection;
		document.body.setAttribute('lang', $locale);
		document.body.dir = currentDirection;
	});

	/**
	 * how much of the shell this state draws, which is requirement 6's line in one place.
	 *
	 * Loading, failing to start and recovering from an update are an application that is not
	 * running, and get the bare frame. Signing in is an application waiting for a person, which is
	 * an application that is running, so it gets the rail.
	 *
	 * **Loading is two different states and the table has one row for it.** Requirement 6 says so
	 * itself: the table is derived from the line rather than being the requirement, so a state it
	 * does not list looks its own answer up. Loading on a fresh launch is *not known yet* and takes
	 * the bare frame. Loading straight after somebody signed in is an application that is running
	 * with a person in it, and taking the rail away for those two seconds is criterion 7a failing:
	 * the rail disappearing and coming back is exactly what makes signing in look like arriving at
	 * a different application.
	 *
	 * So the rail latches: once it is up it does not come down for a load. What it *says* still
	 * follows the account, because a rail offering the way in to somebody who has just come in
	 * would be worse than no rail at all.
	 */
	const shell = $derived.by(() => {
		if (shellState.state === 'ready') {
			return 'full';
		}

		if (shellState.state === 'sign-in') {
			return 'signed-out';
		}

		// a person is in and there is no workspace: the rail is up, and it has no workspace to
		// name, which is the shape the signed-out rail already draws. What the rail says for this
		// state is the workspace ticket's to decide when there is a workspace to create.
		if (shellState.state === 'no-workspace') {
			return 'signed-out';
		}

		if (shellState.state === 'loading' && shellState.railIsUp) {
			// what the rail says still follows who is in, and who is in is whose vault is open.
			return shellState.organization?.session ? 'full' : 'signed-out';
		}

		return 'bare';
	});

	/**
	 * what goes inside the frame, which is startup's other decision about the frame and lives beside
	 * the first.
	 *
	 * `../screen.ts` holds it, for the reason stated at the top of this file: this is a
	 * runes file and a `node:test` cannot import one, so a chain of branches written here is a
	 * decision nothing can drive. It was four branches on the startup state until 2026-08-21, when
	 * the address became the second thing it reads.
	 */
	const screen = $derived(startupScreen(shellState, page.url.pathname));

	/**
	 * what choosing another workspace does: open it, moving the address off a record first.
	 *
	 * The move is handed to the switch as `arrive`, so it happens under the loading page and before
	 * the open, and the directory it lands on is first drawn from the workspace just opened. Where
	 * it lands is `addressAfterSwitch`'s, in `../screen.ts`, for the reason every decision here is
	 * there, read off the trail the shell's window hands in with the choice: the trail is built from
	 * every feature's pages, and startup reads none of them.
	 */
	const switchWorkspace = (
		workspaceId: string,
		trailOf: (routeId: string) => readonly SwitchCrumb<PlaceAddress>[]
	) =>
		void startup.switchWorkspace(workspaceId, {
			arrive: async () => {
				const destination = addressAfterSwitch(page.route.id, trailOf);

				if (destination) {
					await goto(resolve(destination));
				}
			}
		});

	/**
	 * what the rail's account row does, which is put the sign-in card on screen.
	 *
	 * The decision is `wayInFrom`'s, in `../screen.ts`, for the reason the screen itself
	 * is: a runes file cannot be imported by a `node:test`, so a rule written here is a rule nothing
	 * can drive.
	 */
	const goToTheWayIn = () => {
		const destination = wayInFrom(page.url.pathname);

		if (destination) {
			void goto(resolve(destination));
		}
	};
</script>

{#snippet inside()}
	{#if screen === 'loading'}
		<StartupLoading />
	{:else if screen === 'switching'}
		<!-- a switch keeps the window: the rail and the titlebar are up, and only the page loads. -->
		<StartupSwitching name={shellState.switching ?? ''} />
	{:else if screen === 'sign-in'}
		<StartupSignIn
			situation={shellState.signInReason}
			organization={shellState.organization?.organization ?? null}
			isSigningIn={shellState.isSigningIn}
			errorMessage={shellState.error}
			errorDetail={shellState.errorDetail}
			earlier={earlier.offered}
			onSignIn={(username, password) => void startup.signIn(username, password)}
			onDisconnect={() => startup.disconnect()}
			onSetUpOrganization={() => void goto(resolve(THE_FIRST_RUN))}
			onJoinByLink={() => void goto(resolve(THE_JOIN))}
		/>
	{:else if screen === 'no-workspace'}
		<StartupNoWorkspace
			organizationName={shellState.organization?.session?.organizationName ?? ''}
			canCreate={shellState.organization?.session?.role === 'owner'}
			isCreating={createWorkspace.isPending}
			onCreate={(name) => void createFirstWorkspace(name)}
		/>
	{:else if screen === 'recovery' && shellState.recovery}
		<StartupRecovery recovery={shellState.recovery} onRetry={() => void startup.retry()} />
	{:else if screen === 'error'}
		<!-- the reported error does not reach this screen: it is not shown, and nothing
		     writes it down yet. See the component. -->
		<StartupError onRetry={() => void startup.retry()} />
	{:else}
		{@render children?.()}
	{/if}
{/snippet}

{#snippet unreadable()}
	<StartupUnreadable message={shellState.error ?? ''} onRetry={() => void startup.retry()} />
{/snippet}

{#if shellState.isI18nReady}
	<!-- the window the root layout hands over, which supplies the design package's words and
	     direction: inside this gate, because both need a locale that this branch is the only one
	     to have. -->
	{@render shellWindow({
		queryClient,
		currentDirection,
		shell,
		onWayIn: goToTheWayIn,
		onSwitchWorkspace: switchWorkspace,
		dialogs: shellState.railIsUp && Boolean(shellState.organization?.session),
		children: inside
	})}
{:else if startupSurfaceBeforeLocale(shellState) === 'failure'}
	<!--
		A startup that stopped before it knew what language to stop in.

		Everything above is behind the gate because nothing there can be read until a dictionary is
		loaded, and until one is every string resolves to the empty string rather than failing. So a
		failure in the first stage of startup used to show an empty window that had been deliberately
		made visible: nothing to press, and no way back but quitting.
		`../gate.ts` holds the decision and says why it is the only one made on this side of the
		gate.

		**On the bare frame, like every other startup failure.** Requirement 6 gives that state the
		titlebar and its window controls, and this window has no others: the shell draws them because
		`decorations` is false. A screen that stopped the application and took away the way to close
		it would be a worse answer than the one it replaces. The direction is stated rather than
		derived, because deriving it reads a locale that is the thing not there.
	-->
	<!-- the frame renders the undo shortcut whatever it is showing, and that asks for a client.
	     Nothing on this screen queries anything; what the provider buys is the frame. -->
	<QueryClientProvider client={queryClient}>
		{@render bareFrame(unreadable)}
	</QueryClientProvider>
{:else}
	<!-- the blank stretch criterion 16 documents: the application is still starting, and it is on
	     its way to a locale rather than stopped short of one. -->
	<div class="flex h-screen items-center justify-center"></div>
{/if}
