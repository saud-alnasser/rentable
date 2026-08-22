<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { signedInAccount } from '$lib/sync/account';
	import { startWorkspaceSyncManager } from '$lib/sync/autosync';
	import { listenForSignOut } from '$lib/sync/sign-in';
	import { trustWorkspaceData } from '$lib/design/query';
	import { TooltipProvider } from '$lib/design/primitive/tooltip';
	import SonnerProvider from '$lib/design/provider/sonner.svelte';
	import { locale } from '$lib/i18n/i18n-svelte';
	import { localesMetadata } from '$lib/i18n/i18n-translations-util';
	import LayoutCaughtError from '$lib/layout/component/caught-error.svelte';
	import LayoutFrame from '$lib/layout/component/frame.svelte';
	import { toScreen } from '$lib/design/back';
	import { back } from '$lib/design/back.svelte';
	import LayoutStartupError from '$lib/layout/component/startup-error.svelte';
	import LayoutStartupUnreadable from '$lib/layout/component/startup-unreadable.svelte';
	import { CAUGHT_ERROR_EVENT, toCaughtErrorFields } from '$lib/layout/boundary';
	import { shellSurface, wayInFrom } from '$lib/layout/shell-surface';
	import { startupSurfaceBeforeLocale } from '$lib/layout/startup-surface';
	import { recordDiagnosticError } from '$lib/platform/diagnostics';
	import LayoutStartupLoading from '$lib/layout/component/startup-loading.svelte';
	import LayoutStartupRecovery from '$lib/layout/component/startup-recovery.svelte';
	import LayoutStartupSignIn from '$lib/layout/component/startup-sign-in.svelte';
	import { listenForWindowCloseRequests } from '$lib/layout/event';
	import { createStartup } from '$lib/layout/startup';
	import { browserStartupPorts } from '$lib/layout/startup-ports';
	import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query';
	import { getCurrentWindow } from '@tauri-apps/api/window';
	import { onMount } from 'svelte';
	import '../app.css';

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
	 * Everything the application does between the process starting and a person being able to use
	 * it lives in `$lib/layout/startup`, which is a plain unit a `node:test` drives with no window.
	 *
	 * What is left here is the route's own work: mirroring what that unit reports into something
	 * this file can render from, deciding how much of the shell each state draws, and drawing it.
	 */
	const startup = createStartup(browserStartupPorts(queryClient));

	// the one reactive thing. The unit is a plain object with observers, because a runes file
	// cannot be imported by a `node:test` at all, and being testable is the point of it.
	let shellState = $state(startup.snapshot);

	const currentDirection = $derived(localesMetadata[$locale].direction);

	const DAY_CROSSING_CHECK_INTERVAL_MS = 60_000;

	onMount(() => {
		const stopObserving = startup.observe((snapshot) => {
			shellState = snapshot;
		});
		const appWindow = getCurrentWindow();
		let unlistenCloseRequested: (() => void) | undefined;
		let stopListeningForCloseRequests: (() => void) | undefined;
		const stopWorkspaceSyncManager = startWorkspaceSyncManager({
			onResult: (detail) => startup.applySyncOutcome(detail)
		});
		const stopListeningForSignOut = listenForSignOut(() => {
			void startup.signOut();
		});
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

			await startup.start();
		})();

		return () => {
			clearInterval(dayCrossingInterval);
			stopWorkspaceSyncManager();
			stopListeningForSignOut();
			stopObserving();
			unlistenCloseRequested?.();
			stopListeningForCloseRequests?.();
		};
	});

	// the application's own trail, so a back control returns to the screen that opened a record
	// rather than to a fixed place. It is recorded here because every screen is inside this one.
	$effect(() => {
		back.visit(toScreen(page.url));
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

		if (shellState.state === 'loading' && shellState.railIsUp) {
			return signedInAccount(shellState.remoteSync) ? 'full' : 'signed-out';
		}

		return 'bare';
	});

	/**
	 * what goes inside the frame, which is the shell's other decision and lives beside the first.
	 *
	 * `layout/shell-surface.ts` holds it, for the reason stated at the top of this file: this is a
	 * runes file and a `node:test` cannot import one, so a chain of branches written here is a
	 * decision nothing can drive. It was four branches on the startup state until 2026-08-21, when
	 * the address became the second thing it reads.
	 */
	const surface = $derived(shellSurface(shellState, page.url.pathname));

	/**
	 * what the rail's account row does, which is put the sign-in card on screen.
	 *
	 * The decision is `wayInFrom`'s, in `layout/shell-surface.ts`, for the reason the surface itself
	 * is: a runes file cannot be imported by a `node:test`, so a rule written here is a rule nothing
	 * can drive.
	 */
	const goToTheWayIn = () => {
		const destination = wayInFrom(page.url.pathname);

		if (destination) {
			void goto(resolve(destination));
		}
	};

	let { children } = $props();
</script>

{#if shellState.isI18nReady}
	<!--
		The outer of the application's two boundaries, and the honest floor under requirement 8.

		The inner one, inside the frame, catches everything a route drew and leaves the chrome
		standing. It cannot catch the chrome itself: a boundary draws its fallback in place of what
		threw, so a card drawn inside a rail that just threw throws again. This one is outside all
		of it, and what it draws is the shared standalone surface with no frame around it at all.

		That is the one state requirement 6 otherwise forbids in a running application, and it is
		allowed here because the alternative is a blank window nobody can leave without quitting.
	-->
	<svelte:boundary
		onerror={(error) =>
			recordDiagnosticError(CAUGHT_ERROR_EVENT, toCaughtErrorFields('shell', error))}
	>
		<QueryClientProvider client={queryClient}>
			<SonnerProvider>
				<TooltipProvider>
					<!-- the rail's way in navigates, and that is the whole mechanism: signed out,
					     `shellSurface` draws the card over every address but the ones `OPENS_SIGNED_OUT`
					     holds, so leaving one of those is what puts the card on screen. From anywhere else
					     the card is already drawn and `wayInFrom` answers nothing, which is what keeps the
					     reader's place. Starting the flow stays with the card below, the one surface that
					     names the provider. -->
					<LayoutFrame {currentDirection} {shell} onWayIn={goToTheWayIn}>
						{#if surface === 'loading'}
							<LayoutStartupLoading />
						{:else if surface === 'sign-in'}
							<LayoutStartupSignIn
								situation={shellState.signInReason}
								isSigningIn={shellState.isSigningIn}
								isRetrying={shellState.isRetryingSession}
								phase={shellState.signInPhase}
								errorMessage={shellState.error}
								onSignIn={() => void startup.signIn()}
								onRetry={() => void startup.retrySession()}
							/>
						{:else if surface === 'recovery' && shellState.recovery}
							<LayoutStartupRecovery
								recovery={shellState.recovery}
								onRetry={() => void startup.retry()}
							/>
						{:else if surface === 'error'}
							<!-- the reported error does not reach this screen: it is not shown, and nothing
							     writes it down yet. See the component. -->
							<LayoutStartupError onRetry={() => void startup.retry()} />
						{:else}
							{@render children?.()}
						{/if}
					</LayoutFrame>
				</TooltipProvider>
			</SonnerProvider>
		</QueryClientProvider>

		{#snippet failed(error, reset)}
			<!-- the reading direction and the full window, which is everything the frame would have
			     given this surface and all of it that survives the frame having thrown. -->
			<div
				lang={$locale}
				dir={currentDirection}
				class="flex h-screen w-screen flex-col overflow-y-auto bg-background"
			>
				<LayoutCaughtError {error} onRetry={reset} />
			</div>
		{/snippet}
	</svelte:boundary>
{:else if startupSurfaceBeforeLocale(shellState) === 'failure'}
	<!--
		A startup that stopped before it knew what language to stop in.

		Everything above is behind the gate because nothing here can be read until a dictionary is
		loaded, and until one is every string resolves to the empty string rather than failing. So a
		failure in the first stage of startup used to show an empty window that had been deliberately
		made visible: nothing to press, and no way back but quitting.
		`layout/startup-surface.ts` holds the decision and says why it is the only one made on this
		side of the gate.

		**On the bare frame, like every other startup failure.** Requirement 6 gives that state the
		titlebar and its window controls, and this window has no others: the shell draws them because
		`decorations` is false. A screen that stopped the application and took away the way to close
		it would be a worse answer than the one it replaces. The direction is stated rather than
		derived, because deriving it reads a locale that is the thing not there.
	-->
	<!-- the frame renders the undo shortcut whatever it is showing, and that asks for a client.
	     Nothing on this screen queries anything; what the provider buys is the frame. -->
	<QueryClientProvider client={queryClient}>
		<LayoutFrame currentDirection="ltr" shell="bare">
			<LayoutStartupUnreadable
				message={shellState.error ?? ''}
				onRetry={() => void startup.retry()}
			/>
		</LayoutFrame>
	</QueryClientProvider>
{:else}
	<!-- the blank stretch criterion 16 documents: the application is still starting, and it is on
	     its way to a locale rather than stopped short of one. -->
	<div class="flex h-screen items-center justify-center"></div>
{/if}
