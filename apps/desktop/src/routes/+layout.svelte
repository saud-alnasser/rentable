<script lang="ts">
	import { page } from '$app/state';
	import api, { forgetContext } from '$lib/api/caller';
	import {
		tauri,
		type GoogleSignInPhase,
		type Recovery,
		type RemoteSyncState
	} from '$lib/platform/tauri';
	import { workspaceAdmission } from '$lib/sync/admission';
	import {
		isGoogleSignInCancellation,
		listenForSignOut,
		signInWithGoogle
	} from '$lib/sync/sign-in';
	import { startWorkspaceSyncManager } from '$lib/sync/autosync';
	import { syncWorkspaceBeforeExit, syncWorkspaceNow } from '$lib/sync/workspace';
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
	import LayoutStartupLoading from '$lib/layout/component/startup-loading.svelte';
	import LayoutStartupRecovery from '$lib/layout/component/startup-recovery.svelte';
	import LayoutStartupSignIn from '$lib/layout/component/startup-sign-in.svelte';
	import { listenForWindowCloseRequests } from '$lib/layout/event';
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
	let signInReason = $state<'noAccount' | 'windowClosed'>('noAccount');
	let isSigningIn = $state(false);
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
			recovery.backupVersion.trim().length > 0 ||
			recovery.backupFilename.trim().length > 0 ||
			recovery.backupReleaseUrl.trim().length > 0 ||
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
	async function raiseSignInWall(reason: 'noAccount' | 'windowClosed') {
		queryClient.clear();
		startupError = null;
		startupRecovery = null;
		signInReason = reason;
		startupState = 'sign-in';
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
			// control plane was not reached, so this machine holds an identity and no session. It
			// must not read as never having signed in, or the answer is to answer the consent screen
			// again — which lands in exactly the same place.
			startupError = $LL.layout.signIn.incomplete();

			return;
		}

		try {
			startupState = 'loading';
			await continueStartup();
		} catch (error) {
			startupRecovery = null;
			startupState = 'error';
			startupError = getErrorMessage(error);
			await tauri.window.show();
		}
	}

	async function continueStartup() {
		const recovery = await api.app.bootstrap();

		if (applyRecoveryState(recovery)) {
			await tauri.window.show();
			return;
		}

		startupRemoteSync = (await syncWorkspaceNow(startupRemoteSync)).state;

		const { reconciledAt } = await api.app.state.reconcile();
		lastReconciledUtcDay = toUtcDay(reconciledAt).getTime();

		startupRecovery = null;
		startupState = 'ready';
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

			for (const locale of locales) {
				await loadLocaleAsync(locale);
			}

			setLocale(nextLocale);

			isI18nReady = true;
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
			startupRecovery = null;
			startupState = 'error';
			startupError = getErrorMessage(error);
			await tauri.window.show();
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
					await queryClient.invalidateQueries({ queryKey: settingsKeys.remoteSync });
				} else {
					await Promise.all([
						queryClient.invalidateQueries({ queryKey: settingsKeys.backups }),
						queryClient.invalidateQueries({ queryKey: settingsKeys.remoteSync })
					]);
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

	let { children } = $props();
</script>

{#if isI18nReady}
	<QueryClientProvider client={queryClient}>
		<SonnerProvider>
			<TooltipProvider>
				<LayoutFrame {currentDirection} showNavigation={startupState === 'ready'}>
					{#if startupState === 'loading'}
						<LayoutStartupLoading />
					{:else if startupState === 'sign-in'}
						<LayoutStartupSignIn
							reason={signInReason}
							{isSigningIn}
							phase={signInPhase}
							errorMessage={startupError}
							onSignIn={() => void signIn()}
						/>
					{:else if startupState === 'recovery' && startupRecovery}
						<LayoutStartupRecovery recovery={startupRecovery} onRetry={() => void startApp()} />
					{:else if startupState === 'error'}
						<LayoutStartupError message={startupError} onRetry={() => void startApp()} />
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
