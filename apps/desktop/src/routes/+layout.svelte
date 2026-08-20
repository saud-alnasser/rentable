<script lang="ts">
	import { page } from '$app/state';
	import api, { forgetContext } from '$lib/api/caller';
	import {
		tauri,
		type GoogleSignInPhase,
		type Recovery,
		type RemoteSyncState
	} from '$lib/platform/tauri';
	import { signedInAccount } from '$lib/sync/account';
	import { workspaceAdmission } from '$lib/sync/admission';
	import {
		isGoogleSignInCancellation,
		listenForSignOut,
		signInWithGoogle
	} from '$lib/sync/sign-in';
	import { startWorkspaceSyncManager } from '$lib/sync/autosync';
	import {
		announceReceivedRows,
		syncWorkspaceBeforeExit,
		syncWorkspaceNow
	} from '$lib/sync/workspace';
	import { toUtcDay } from '$lib/api/date';
	import { invalidateRoot, trustWorkspaceData } from '$lib/design/query';
	import { keys as settingsKeys } from '$lib/settings/query';
	import { TooltipProvider } from '$lib/design/primitive/tooltip';
	import SonnerProvider from '$lib/design/provider/sonner.svelte';
	import { toast } from 'svelte-sonner';
	import { toErrorText } from '$lib/error/message';
	import LL, { locale, setLocale } from '$lib/i18n/i18n-svelte';
	import { localesMetadata } from '$lib/i18n/i18n-translations-util';
	import type { Locales } from '$lib/i18n/i18n-types';
	import { baseLocale, locales } from '$lib/i18n/i18n-util';
	import { loadLocaleAsync } from '$lib/i18n/i18n-util.async';
	import LayoutFrame from '$lib/layout/component/frame.svelte';
	import { toScreen } from '$lib/design/back';
	import { back } from '$lib/design/back.svelte';
	import LayoutStartupError from '$lib/layout/component/startup-error.svelte';
	import { recordDiagnosticError } from '$lib/platform/diagnostics';
	import LayoutStartupLoading from '$lib/layout/component/startup-loading.svelte';
	import LayoutStartupRecovery from '$lib/layout/component/startup-recovery.svelte';
	import LayoutStartupSignIn from '$lib/layout/component/startup-sign-in.svelte';
	import { listenForWindowCloseRequests } from '$lib/layout/event';
	import { reportStartupComplete, reportStartupStage } from '$lib/layout/startup-stage.svelte';
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
	 * *`choose-workspace` went with Google Drive sync (decision 07). It offered two things — open
	 * the workspace kept on this machine, or link a Drive folder — and there is one workspace,
	 * created at sign-up, with nothing to choose between.*
	 */
	type StartupState = 'loading' | 'sign-in' | 'ready' | 'error' | 'recovery';

	let isI18nReady = $state(false);
	let startupState = $state<StartupState>('loading');
	let startupError = $state<string | null>(null);
	let startupRecovery = $state<Recovery | null>(null);
	let startupRemoteSync = $state<RemoteSyncState | null>(null);
	// which of the two the wall is saying, and it is only read while the wall is up.
	let signInReason = $state<'noAccount' | 'windowClosed' | 'noSession'>('noAccount');
	/**
	 * whether the rail has been on screen yet in this run.
	 *
	 * It latches on and is never cleared: what it answers is *has this application been running*,
	 * and a load in the middle of a session does not un-answer that. Failing to start and update
	 * recovery still take the bare frame, because those are states where it stopped.
	 */
	let railIsUp = $state(false);

	/**
	 * Enter the failure state, and write down what happened.
	 *
	 * **The screen stopped showing the error, so something has to keep it.** `startup-error.svelte`
	 * refuses the message deliberately and offers the diagnostics folder instead, which is only an
	 * honest offer if the failure is actually in there. It never was: `startupError` reaches the
	 * sign-in wall and reached the failure screen, and no path wrote it to the diagnostics at all.
	 *
	 * The three places that can fail a startup call this rather than setting the state themselves,
	 * because three copies of *set the state, format the error, show the window* is how one of them
	 * comes to skip a step.
	 */
	function failStartup(error: unknown) {
		startupRecovery = null;
		startupState = 'error';
		startupError = getErrorMessage(error);

		recordDiagnosticError('startup.failed', { error: startupError });

		return tauri.window.show();
	}
	let isSigningIn = $state(false);
	let isRetryingSession = $state(false);
	let signInPhase = $state<GoogleSignInPhase | null>(null);
	let isSyncingWindowClose = false;
	let isFinalizingWindowClose = false;
	const DAY_CROSSING_CHECK_INTERVAL_MS = 60_000;
	let lastReconciledUtcDay = toUtcDay(Date.now()).getTime();
	let isReconcilingDayCrossing = false;
	let currentDirection = $derived(localesMetadata[$locale].direction);

	function getErrorMessage(error: unknown) {
		return toErrorText(error, $LL, $LL.layout.startup.failedToStartFallback());
	}

	function hasRecoveryData(recovery: Recovery | null) {
		if (!recovery) {
			return false;
		}

		return (
			recovery.targetVersion.trim().length > 0 ||
			recovery.previousVersion.trim().length > 0 ||
			recovery.previousReleaseUrl.trim().length > 0 ||
			recovery.updateError !== null
		);
	}

	function applyRecoveryState(recovery: Recovery) {
		if (!hasRecoveryData(recovery)) {
			startupRecovery = null;
			return false;
		}

		if (recovery.status === 'pending') {
			startupRecovery = recovery;
			startupState = 'recovery';
			return true;
		}

		startupRecovery = null;

		return false;
	}

	async function finalizeWindowClose(skipSync = false) {
		if (isFinalizingWindowClose) {
			return;
		}

		if (!skipSync && isSyncingWindowClose) {
			return;
		}

		if (!skipSync) {
			isSyncingWindowClose = true;
		}

		try {
			await tauri.window.hide();

			if (!skipSync && startupState === 'ready') {
				startupRemoteSync = (await syncWorkspaceBeforeExit(startupRemoteSync)).state;
			}
		} catch {
			/* ignore close sync failures */
		} finally {
			isSyncingWindowClose = false;
			isFinalizingWindowClose = true;

			try {
				await tauri.window.close();
			} catch {
				isFinalizingWindowClose = false;
			}
		}
	}

	/**
	 * Put the sign-in wall up, and leave it up.
	 *
	 * Everything the application knows how to draw is behind it, so this clears what was drawn
	 * for whoever was here before: the query cache holds a workspace this machine may no longer
	 * read, and a screen rendered from it after a sign-out is the criterion failing quietly
	 * rather than loudly.
	 */
	async function raiseSignInWall(reason: 'noAccount' | 'windowClosed' | 'noSession') {
		queryClient.clear();
		startupError = null;
		startupRecovery = null;
		signInReason = reason;
		startupState = 'sign-in';
		railIsUp = true;
		await tauri.window.show();
	}

	/**
	 * Whether startup may carry on, raising the wall where it may not.
	 *
	 * Every caller reads `if (!(await admit())) return`, because there is nothing to fall through
	 * to: what follows an unadmitted machine is the wall, and it is already up by then.
	 */
	async function admit() {
		const admission = workspaceAdmission(startupRemoteSync);

		if (admission.kind !== 'signInRequired') {
			return true;
		}

		await raiseSignInWall(admission.reason);

		return false;
	}

	/**
	 * Sign in at the wall, and go straight on into the application on the far side of it.
	 *
	 * The two failures are kept apart deliberately. A sign-in that fails leaves the wall up and
	 * says why on it — the person is still standing at it, and an error screen would take away
	 * the control they need. A startup that fails after a sign-in has succeeded is the ordinary
	 * failure every other path here reports, and reads as one.
	 */
	async function signIn() {
		if (isSigningIn) {
			return;
		}

		isSigningIn = true;
		signInPhase = 'authorizing';
		startupError = null;

		// opened before the call and closed after it: an event that arrives with nobody listening
		// is the only way this screen can miss the moment the consent screen was answered.
		const unlistenPhase = await tauri.auth.google.onPhase((phase) => {
			signInPhase = phase;
		});

		try {
			startupRemoteSync = await signInWithGoogle();
		} catch (error) {
			// abandoning the consent screen is an answer rather than a failure, and says nothing:
			// the person closed that window themselves and is looking at this one.
			if (!isGoogleSignInCancellation(error)) {
				startupError = getErrorMessage(error);
			}

			return;
		} finally {
			unlistenPhase();
			isSigningIn = false;
			signInPhase = null;
		}

		queryClient.setQueryData(settingsKeys.remoteSync, startupRemoteSync);

		// the context was built while nobody was signed in, so it belongs to nobody. Nothing else
		// rebuilds it, and it outlives this screen by the whole run of the process.
		forgetContext();

		if (!(await admit())) {
			// signed in with Google, and still not through: the consent screen was answered and the
			// control plane was not reached, so this machine holds an identity and no session.
			// `workspaceAdmission` has already named that situation `noSession`, and the wall says
			// so and offers the call that failed. Answering the consent screen again lands in
			// exactly the same place. Nothing is set here any more, which is the point: what the
			// screen says now comes from the state rather than from a sentence written at one of
			// the several places that can reach it.
			return;
		}

		try {
			startupState = 'loading';
			await continueStartup();
		} catch (error) {
			await failStartup(error);
		}
	}

	/**
	 * Reach the control plane with the identity this machine already holds, and go on if that works.
	 *
	 * **The retry for the `noSession` wall, and it opens no browser.** What failed was one call
	 * after the sign-in, so this repeats that call and nothing else. Being unreachable again is not
	 * an error and says nothing new: admission returns the same situation, the wall stays where it
	 * is, and the notice on it already reads *check your connection and try again*.
	 */
	async function retrySession() {
		if (isRetryingSession || isSigningIn) {
			return;
		}

		isRetryingSession = true;
		startupError = null;

		try {
			startupRemoteSync = await tauri.remoteSync.establishSession();
			queryClient.setQueryData(settingsKeys.remoteSync, startupRemoteSync);

			// built before there was a session, so it belongs to a machine that could not act. The
			// same reason signing in forgets it, and the same cost if it is kept.
			forgetContext();

			if (!(await admit())) {
				return;
			}
		} catch (error) {
			startupError = getErrorMessage(error);

			return;
		} finally {
			isRetryingSession = false;
		}

		try {
			startupState = 'loading';
			await continueStartup();
		} catch (error) {
			await failStartup(error);
		}
	}

	async function continueStartup() {
		// the loading screen's stages, reported where they actually happen. Signing in and
		// retrying a session both land here rather than at the top, so those paths start the bar
		// at the third of five, which is what they have genuinely done.
		reportStartupStage('workspace');

		const recovery = await api.app.bootstrap();

		if (applyRecoveryState(recovery)) {
			await tauri.window.show();
			return;
		}

		// **The wall is decided again here, because the bootstrap can change the answer.** It is
		// what mints, and the mint is what learns this account is no longer a member of the
		// workspace this machine held — which gives up the workspace and the session. Admitting
		// only before it would carry on into a database that is no longer anybody's and fail on
		// the first read, with the same thing happening on every launch after.
		startupRemoteSync = await tauri.remoteSync.getState();

		if (!(await admit())) {
			return;
		}

		// **`received` is dropped here on purpose**, which is the one place that is true: the
		// reconcile two lines down is a whole-table pass over exactly what a pull would have made
		// stale, and the render has not happened yet. Every other caller of a dispatch has to
		// announce, and `announceReceivedRows` is what they call.
		reportStartupStage('changes');
		startupRemoteSync = (await syncWorkspaceNow(startupRemoteSync)).state;

		reportStartupStage('records');
		const { reconciledAt } = await api.app.state.reconcile();
		lastReconciledUtcDay = toUtcDay(reconciledAt).getTime();

		startupRecovery = null;
		startupState = 'ready';
		railIsUp = true;

		// the last stage is timed by finishing, because nothing follows it to time it.
		reportStartupComplete();

		await tauri.window.show();
	}

	// derived state moves only at UTC day boundaries, so an app left running crosses into
	// wrong statuses at midnight UTC. Comparing calendar days on every tick — rather than
	// counting elapsed ticks — keeps the check correct across sleep and wake.
	async function reconcileOnDayCrossing() {
		if (startupState !== 'ready' || isReconcilingDayCrossing) {
			return;
		}

		if (toUtcDay(Date.now()).getTime() === lastReconciledUtcDay) {
			return;
		}

		isReconcilingDayCrossing = true;

		try {
			const { reconciledAt } = await api.app.state.reconcile();
			lastReconciledUtcDay = toUtcDay(reconciledAt).getTime();
			await invalidateRoot(queryClient);
		} catch {
			/* the next tick retries */
		} finally {
			isReconcilingDayCrossing = false;
		}
	}

	async function startApp() {
		reportStartupStage('settings');
		startupState = 'loading';
		startupError = null;
		startupRecovery = null;
		startupRemoteSync = null;

		try {
			// the shell's own settings, read off the shell. It carries the locale the sign-in screen
			// is drawn in, so it has to be readable before there is an account — and a procedure is
			// not, now that a request names its acting user.
			const settings = await tauri.settings.get();
			const nextLocale = (settings.locale ?? baseLocale) as Locales;

			// **The reader's own locale first, so the loading screen can be drawn.** *Reordered
			// 2026-08-20.* This loaded every locale before setting one, and nothing in the tree
			// renders until `isI18nReady`, so the application's true first frame was an empty
			// window for the whole of the stage the bar calls `settings` — a loading screen absent
			// for the first stage of loading fails its own purpose.
			await loadLocaleAsync(nextLocale);
			setLocale(nextLocale);

			isI18nReady = true;

			// **The rest still load inside this stage, and the reason is the settings page.**
			// `changeLocale` there calls `setLocale` without awaiting a load, on the standing
			// guarantee that every locale is already in memory. Deferring these past startup would
			// leave that call switching to a dictionary that is not there, so they are merely moved
			// after the first frame rather than out of the startup path.
			for (const locale of locales) {
				if (locale !== nextLocale) {
					await loadLocaleAsync(locale);
				}
			}

			reportStartupStage('account');
			startupRemoteSync = await tauri.remoteSync.getState();

			// **The wall, and everything below this line is behind it.** The bootstrap opens the
			// database and the reconcile writes to it — so criterion 3 is this ordering rather than
			// a screen: none of it runs before there is an account. The locale is loaded above it
			// just as deliberately, because the wall itself has to be readable in the language its
			// reader chose.
			if (!(await admit())) {
				return;
			}

			await continueStartup();
		} catch (error) {
			startupRemoteSync = null;
			await failStartup(error);
		}
	}

	onMount(() => {
		const appWindow = getCurrentWindow();
		let unlistenCloseRequested: (() => void) | undefined;
		let stopListeningForCloseRequests: (() => void) | undefined;
		const stopWorkspaceSyncManager = startWorkspaceSyncManager({
			onResult: async (detail) => {
				const state = await tauri.remoteSync.getState().catch(() => null);
				if (state) {
					startupRemoteSync = state;
					queryClient.setQueryData(settingsKeys.remoteSync, state);
				}

				// The window closed with no contact, so replication has stopped and the workspace is
				// otherwise untouched — nothing recorded during it was discarded, which is what the
				// sentence says as well as what the code does. It is raised here rather than left to
				// the arms below because it is the one outcome the user has to act on, and an
				// invalidation is not an answer to it.
				if (detail.action === 'signInRequired') {
					toast.error($LL.settingsHooks.sessionExpired());
				}

				await queryClient.invalidateQueries({ queryKey: settingsKeys.remoteSync });

				// **The fourth writer announcing itself.** Rows arrived from another device, so a
				// status that was right before the pull can be wrong after it. The guard is the
				// day-crossing pass's, shared rather than duplicated: both run a whole-table
				// reconcile and two at once is one of them wasted.
				if (detail.received && !isReconcilingDayCrossing) {
					isReconcilingDayCrossing = true;

					try {
						lastReconciledUtcDay = toUtcDay(await announceReceivedRows(queryClient)).getTime();
					} finally {
						isReconcilingDayCrossing = false;
					}
				}
			}
		});
		const stopListeningForSignOut = listenForSignOut(() => {
			void (async () => {
				// the held context names an account this machine no longer has credentials for, and
				// nothing else in the process would ever notice.
				forgetContext();
				startupRemoteSync = await tauri.remoteSync.getState().catch(() => null);
				await raiseSignInWall('noAccount');
			})();
		});
		const handleWindowCloseRequest = () => {
			void finalizeWindowClose(startupState !== 'ready');
		};
		const dayCrossingInterval = setInterval(() => {
			void reconcileOnDayCrossing();
		}, DAY_CROSSING_CHECK_INTERVAL_MS);

		void (async () => {
			unlistenCloseRequested = await appWindow.onCloseRequested(async (event) => {
				if (isFinalizingWindowClose) {
					return;
				}

				event.preventDefault();
				await finalizeWindowClose(startupState !== 'ready');
			});

			stopListeningForCloseRequests = listenForWindowCloseRequests(handleWindowCloseRequest);

			await startApp();
		})();

		return () => {
			clearInterval(dayCrossingInterval);
			stopWorkspaceSyncManager();
			stopListeningForSignOut();
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
		if (!isI18nReady || typeof document === 'undefined') {
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
	 * with a person in it, and taking the rail away for those two seconds is criterion 7a failing
	 * — the rail disappearing and coming back is exactly what makes signing in look like arriving
	 * at a different application.
	 *
	 * So the rail latches: once it is up it does not come down for a load. What it *says* still
	 * follows the account, because a rail offering the way in to somebody who has just come in
	 * would be worse than no rail at all.
	 */
	const shell = $derived.by(() => {
		if (startupState === 'ready') {
			return 'full';
		}

		if (startupState === 'sign-in') {
			return 'signed-out';
		}

		if (startupState === 'loading' && railIsUp) {
			return signedInAccount(startupRemoteSync) ? 'full' : 'signed-out';
		}

		return 'bare';
	});

	let { children } = $props();
</script>

{#if isI18nReady}
	<QueryClientProvider client={queryClient}>
		<SonnerProvider>
			<TooltipProvider>
				<LayoutFrame {currentDirection} {shell} onSignIn={() => void signIn()}>
					{#if startupState === 'loading'}
						<LayoutStartupLoading />
					{:else if startupState === 'sign-in'}
						<LayoutStartupSignIn
							situation={signInReason}
							{isSigningIn}
							isRetrying={isRetryingSession}
							phase={signInPhase}
							errorMessage={startupError}
							onSignIn={() => void signIn()}
							onRetry={() => void retrySession()}
						/>
					{:else if startupState === 'recovery' && startupRecovery}
						<LayoutStartupRecovery recovery={startupRecovery} onRetry={() => void startApp()} />
					{:else if startupState === 'error'}
						<!-- the reported error does not reach this screen: it is not shown, and nothing
						     writes it down yet. See the component. -->
						<LayoutStartupError onRetry={() => void startApp()} />
					{:else}
						{@render children?.()}
					{/if}
				</LayoutFrame>
			</TooltipProvider>
		</SonnerProvider>
	</QueryClientProvider>
{:else}
	<div class="flex h-screen items-center justify-center"></div>
{/if}
