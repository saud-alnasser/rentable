<script lang="ts">
	import api from '$lib/api/mod';
	import {
		tauri,
		type GoogleDriveConflictResolution,
		type Recovery,
		type RemoteSyncState
	} from '$lib/api/tauri';
	import { resolveGoogleDriveLink } from '$lib/api/utils/remote-sync-google-drive';
	import { startGoogleDriveAutosyncManager } from '$lib/api/utils/remote-sync-google-drive-autosync';
	import {
		getWorkspaceFromSyncState,
		inspectWorkspaceSyncState,
		shouldChooseWorkspaceMode,
		syncWorkspaceBeforeExit,
		syncWorkspaceNow
	} from '$lib/api/utils/workspace-sync';
	import { TooltipProvider } from '$lib/common/components/fragments/tooltip';
	import { LinkSession } from '$lib/resources/sync/link-session.svelte';
	import { pendingConflict } from '$lib/resources/sync/pending-conflict.svelte';
	import SonnerProvider from '$lib/common/components/providers/sonner-provider.svelte';
	import { toErrorText } from '$lib/error/message';
	import LL, { locale, setLocale } from '$lib/i18n/i18n-svelte';
	import { localesMetadata } from '$lib/i18n/i18n-translations-util';
	import type { Locales } from '$lib/i18n/i18n-types';
	import { baseLocale, locales } from '$lib/i18n/i18n-util';
	import { loadLocaleAsync } from '$lib/i18n/i18n-util.async';
	import LayoutFrame from '$lib/resources/layout/components/layout-frame.svelte';
	import LayoutStartupError from '$lib/resources/layout/components/layout-startup-error.svelte';
	import LayoutStartupLoading from '$lib/resources/layout/components/layout-startup-loading.svelte';
	import LayoutStartupRecovery from '$lib/resources/layout/components/layout-startup-recovery.svelte';
	import LayoutStartupWorkspaceChoice from '$lib/resources/layout/components/layout-startup-workspace-choice.svelte';
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

	type StartupState = 'loading' | 'choose-workspace' | 'ready' | 'error' | 'recovery';

	let isI18nReady = $state(false);
	let startupState = $state<StartupState>('loading');
	let startupError = $state<string | null>(null);
	let startupRecovery = $state<Recovery | null>(null);
	let startupRemoteSync = $state<RemoteSyncState | null>(null);
	const linkSession = new LinkSession({
		onState: (state) => {
			startupRemoteSync = state;
			queryClient.setQueryData(['settings', 'remote-sync'], state);
		},
		onResolutionRequired: async (preparation) => {
			pendingConflict.present(preparation);
			startupState = 'choose-workspace';
			await api.app.window.show();
		},
		resolve: async (preparation) => {
			const result = await resolveGoogleDriveLink(preparation);
			startupRemoteSync = result.state;
			pendingConflict.clear();
			await continueStartup(true);
		},
		onFailure: async (error) => {
			startupRecovery = null;
			startupState = 'choose-workspace';
			pendingConflict.clear();
			startupError = getErrorMessage(error);
			await api.app.window.show();
		},
		onCancelled: async () => {
			startupRemoteSync = await tauri.remoteSync.getState().catch(() => startupRemoteSync);
			if (startupRemoteSync) {
				queryClient.setQueryData(['settings', 'remote-sync'], startupRemoteSync);
			}
		}
	});
	let isHandlingStartupChoice = $state(false);
	let isSyncingWindowClose = false;
	let isFinalizingWindowClose = false;
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
			await api.app.window.hide();

			if (!skipSync && startupState === 'ready') {
				startupRemoteSync = (await syncWorkspaceBeforeExit(startupRemoteSync)).state;
			}
		} catch {
			/* ignore close sync failures */
		} finally {
			isSyncingWindowClose = false;
			isFinalizingWindowClose = true;

			try {
				await api.app.window.close();
			} catch {
				isFinalizingWindowClose = false;
			}
		}
	}

	async function continueStartup(skipRemoteSync = false) {
		const recovery = await api.app.bootstrap();

		if (applyRecoveryState(recovery)) {
			await api.app.window.show();
			return;
		}

		if (!skipRemoteSync) {
			const result = await syncWorkspaceNow(startupRemoteSync, { autosaveLocal: true });
			startupRemoteSync = result.state;

			if (pendingConflict.present(result.preparation)) {
				startupState = 'choose-workspace';
				await api.app.window.show();
				return;
			}
		}

		await api.app.state.reconcile();

		startupRecovery = null;
		startupState = 'ready';
		await api.app.window.show();
	}

	async function startApp() {
		await linkSession.cancel();

		startupState = 'loading';
		startupError = null;
		startupRecovery = null;
		startupRemoteSync = null;
		pendingConflict.clear();
		isHandlingStartupChoice = false;

		try {
			const settings = await api.app.settings.get();
			const nextLocale = (settings.locale ?? baseLocale) as Locales;

			for (const locale of locales) {
				await loadLocaleAsync(locale);
			}

			setLocale(nextLocale);

			isI18nReady = true;
			startupRemoteSync = await api.app.remoteSync.getState();

			if (getWorkspaceFromSyncState(startupRemoteSync)?.provider === 'googleDrive') {
				const inspectedLink = await inspectWorkspaceSyncState(startupRemoteSync);
				if (inspectedLink) {
					startupRemoteSync = inspectedLink.state;

					if (pendingConflict.present(inspectedLink)) {
						startupState = 'choose-workspace';
						await api.app.window.show();
						return;
					}
				}
			}

			if (shouldChooseWorkspaceMode(startupRemoteSync)) {
				startupState = 'choose-workspace';
				await api.app.window.show();
				return;
			}

			await continueStartup();
		} catch (error) {
			startupRemoteSync = null;
			startupRecovery = null;
			startupState = 'error';
			startupError = getErrorMessage(error);
			await api.app.window.show();
		}
	}

	async function openLocalWorkspace() {
		if (isHandlingStartupChoice || linkSession.isFinalizing) {
			return;
		}

		isHandlingStartupChoice = true;
		startupError = null;

		try {
			await linkSession.cancel();
			pendingConflict.clear();
			await continueStartup();
		} catch (error) {
			startupRecovery = null;
			startupState = 'error';
			startupError = getErrorMessage(error);
			await api.app.window.show();
		} finally {
			isHandlingStartupChoice = false;
		}
	}

	async function resolveStartupLink(resolution: GoogleDriveConflictResolution) {
		if (isHandlingStartupChoice) {
			return;
		}

		isHandlingStartupChoice = true;
		startupError = null;

		try {
			const result = await pendingConflict.resolve(resolution);

			if (!result) {
				return;
			}

			startupRemoteSync = result.state;
			await continueStartup(true);
		} catch (error) {
			startupRecovery = null;
			startupState = 'choose-workspace';
			startupError = getErrorMessage(error);
			await api.app.window.show();
		} finally {
			isHandlingStartupChoice = false;
		}
	}

	async function cancelStartupLinkConflict() {
		if (linkSession.isFinalizing) {
			return;
		}

		if (linkSession.isAuthorizing) {
			await linkSession.cancel();
			startupState = 'choose-workspace';
			await api.app.window.show();
			return;
		}

		if (isHandlingStartupChoice) {
			return;
		}

		isHandlingStartupChoice = true;
		startupError = null;

		try {
			const dismissal = await pendingConflict.dismiss();

			if (!dismissal) {
				return;
			}

			if (dismissal.deferred) {
				await continueStartup(true);
				return;
			}

			startupRemoteSync = dismissal.state;
			startupState = 'choose-workspace';
			await api.app.window.show();
		} catch (error) {
			startupRecovery = null;
			startupState = 'choose-workspace';
			startupError = getErrorMessage(error);
			await api.app.window.show();
		} finally {
			isHandlingStartupChoice = false;
		}
	}

	async function relinkBrokenGoogleDriveAtStartup() {
		if (isHandlingStartupChoice) {
			return;
		}

		isHandlingStartupChoice = true;
		startupError = null;

		try {
			const state = await pendingConflict.relink();

			if (!state) {
				return;
			}

			startupRemoteSync = state;
			queryClient.setQueryData(['settings', 'remote-sync'], startupRemoteSync);
			linkSession.begin();
			startupState = 'choose-workspace';
			await api.app.window.show();
		} catch (error) {
			startupRecovery = null;
			startupState = 'choose-workspace';
			startupError = getErrorMessage(error);
			await api.app.window.show();
		} finally {
			isHandlingStartupChoice = false;
		}
	}

	async function linkGoogleDriveAtStartup() {
		if (isHandlingStartupChoice || linkSession.isFinalizing) {
			return;
		}

		if (linkSession.isAuthorizing) {
			await linkSession.cancel();
			await api.app.window.show();
			return;
		}

		startupError = null;

		// the user asked to link, so an answer they waved away earlier is not the answer to this.
		pendingConflict.forget();
		pendingConflict.clear();
		linkSession.begin();
	}

	onMount(() => {
		const appWindow = getCurrentWindow();
		let unlistenCloseRequested: (() => void) | undefined;
		const stopAutosyncManager = startGoogleDriveAutosyncManager({
			onResult: async (detail) => {
				const state = await tauri.remoteSync.getState().catch(() => null);
				if (state) {
					startupRemoteSync = state;
					queryClient.setQueryData(['settings', 'remote-sync'], state);
				}

				if (detail.action === 'pulled') {
					await Promise.all([
						queryClient.invalidateQueries({ queryKey: ['settings', 'data'] }),
						queryClient.invalidateQueries({ queryKey: ['settings', 'backups'] }),
						queryClient.invalidateQueries({ queryKey: ['settings', 'remote-sync'] }),
						queryClient.invalidateQueries({ queryKey: ['contracts'] }),
						queryClient.invalidateQueries({ queryKey: ['tenants'] }),
						queryClient.invalidateQueries({ queryKey: ['complexes'] })
					]);
				} else if (
					detail.action === 'pushed' ||
					detail.action === 'none' ||
					detail.action === 'error'
				) {
					await Promise.all([
						queryClient.invalidateQueries({ queryKey: ['settings', 'backups'] }),
						queryClient.invalidateQueries({ queryKey: ['settings', 'remote-sync'] })
					]);
				}
			}
		});
		const handleWindowCloseRequest = () => {
			void finalizeWindowClose(startupState !== 'ready');
		};

		void (async () => {
			unlistenCloseRequested = await appWindow.onCloseRequested(async (event) => {
				if (isFinalizingWindowClose) {
					return;
				}

				event.preventDefault();
				await finalizeWindowClose(startupState !== 'ready');
			});

			window.addEventListener('rentable:window-close-request', handleWindowCloseRequest);

			await startApp();
		})();

		return () => {
			void linkSession.cancel();
			stopAutosyncManager();
			unlistenCloseRequested?.();
			window.removeEventListener('rentable:window-close-request', handleWindowCloseRequest);
		};
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
				<LayoutFrame {currentDirection} showNavbar={startupState === 'ready'}>
					{#if startupState === 'loading'}
						<LayoutStartupLoading />
					{:else if startupState === 'choose-workspace' && startupRemoteSync}
						<LayoutStartupWorkspaceChoice
							syncState={startupRemoteSync}
							isWorking={isHandlingStartupChoice || pendingConflict.isWorking}
							isLinkingGoogleDrive={linkSession.isLinking}
							isFinalizingGoogleDriveLink={linkSession.isFinalizing}
							errorMessage={startupError}
							linkConflict={pendingConflict.conflict}
							onOpenLocal={() => void openLocalWorkspace()}
							onLinkGoogleDrive={() => void linkGoogleDriveAtStartup()}
							onCancelGoogleDriveLink={() => void cancelStartupLinkConflict()}
							onLinkKeepLocal={() => void resolveStartupLink('local')}
							onLinkUseRemote={() => void resolveStartupLink('remote')}
							onRelinkGoogleDrive={() => void relinkBrokenGoogleDriveAtStartup()}
							onCancelLinkConflict={() => void cancelStartupLinkConflict()}
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
