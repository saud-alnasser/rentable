<script lang="ts">
	import api from '$lib/api/mod';
	import { tauri, type AvailableUpdate, type UpdaterDownloadEvent } from '$lib/api/tauri';
	import type {
		GoogleDriveLinkPreparation,
		GoogleDriveLinkResolution
	} from '$lib/api/utils/remote-sync-google-drive';
	import { resetBrokenGoogleDriveWorkspace } from '$lib/api/utils/remote-sync-google-drive';
	import {
		inspectWorkspaceSyncState,
		shouldDeferWorkspaceConflict,
		syncWorkspaceBeforeExit
	} from '$lib/api/utils/workspace-sync';
	import { Button } from '$lib/common/components/fragments/button';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/common/components/fragments/card';
	import { Spinner } from '$lib/common/components/fragments/spinner';
	import { formatLocaleDate } from '$lib/common/utils/locale';
	import { cn } from '$lib/common/utils/tailwind.js';
	import { recordDiagnosticError } from '$lib/diagnostics/record';
	import { toErrorDetail, toErrorMessage, toErrorText } from '$lib/error/message';
	import { toTauriErrorCode } from '$lib/error/tauri';
	import { LL, locale, setLocale } from '$lib/i18n/i18n-svelte';
	import { localesMetadata } from '$lib/i18n/i18n-translations-util';
	import type { Locales } from '$lib/i18n/i18n-types';
	import SettingsDiagnosticsCard from '$lib/resources/settings/components/settings-diagnostics-card.svelte';
	import SettingsEndingSoonCard from '$lib/resources/settings/components/settings-ending-soon-card.svelte';
	import SettingsLocaleCard from '$lib/resources/settings/components/settings-locale-card.svelte';
	import SettingsSyncCard from '$lib/resources/settings/components/settings-sync-card.svelte';
	import SettingsUpdatesCard from '$lib/resources/settings/components/settings-updates-card.svelte';
	import {
		keys,
		useCancelGoogleDriveLink,
		useCreateWorkspaceSnapshot,
		useFetchRemoteSyncState,
		useFetchSettings,
		useResolveGoogleDriveLink,
		useSetEndingSoonNoticeDays,
		useSyncGoogleDriveWorkspace,
		useUnlinkGoogleDriveWorkspace,
		type SyncGoogleDriveWorkspaceResult
	} from '$lib/resources/settings/hooks/queries';
	import { LinkSession } from '$lib/resources/sync/link-session.svelte';
	import { useQueryClient } from '@tanstack/svelte-query';
	import { onDestroy } from 'svelte';
	import { toast } from 'svelte-sonner';

	// type AppSettings = Awaited<ReturnType<typeof api.app.settings.get>>;

	const settingsQuery = useFetchSettings();
	const remoteSyncQuery = useFetchRemoteSyncState();
	const queryClient = useQueryClient();
	const setEndingSoonNoticeDaysMutation = useSetEndingSoonNoticeDays();
	const createWorkspaceSnapshotMutation = useCreateWorkspaceSnapshot();
	const resolveGoogleDriveLinkMutation = useResolveGoogleDriveLink();
	const cancelGoogleDriveLinkMutation = useCancelGoogleDriveLink();
	const syncGoogleDriveWorkspaceMutation = useSyncGoogleDriveWorkspace('sync');
	const unlinkGoogleDriveWorkspaceMutation = useUnlinkGoogleDriveWorkspace();
	const settingsCardClass = 'border-border/70 bg-card/65 shadow-xl backdrop-blur-xl';
	const settingsOverviewPanelClass =
		'rounded-[1.25rem] border border-border/70 bg-card/40 p-3 shadow-sm backdrop-blur-md';

	let endingSoonNoticeDaysValue = $state<number | ''>('');
	let isCheckingForUpdate = $state(false);
	let hasCheckedForUpdate = $state(false);
	let availableUpdate = $state<AvailableUpdate | null>(null);
	let updateCheckError = $state<string | null>(null);
	let isInstallingUpdate = $state(false);
	let disconnectingGoogleDriveAccountId = $state<string | null>(null);
	let updateInstallError = $state<string | null>(null);
	let updateInstallComplete = $state(false);
	let updateDownloadedBytes = $state(0);
	let updateContentLength = $state<number | null>(null);
	let pendingGoogleDriveLink = $state<GoogleDriveLinkPreparation | null>(null);
	const linkSession = new LinkSession({
		onState: (state) => {
			queryClient.setQueryData(keys.remoteSync, state);
		},
		onResolutionRequired: (preparation) => {
			pendingGoogleDriveLink = preparation;
		},
		resolve: async (preparation) => {
			await resolveGoogleDriveLinkMutation.mutateAsync({
				preparation,
				resolution: preparation.recommendedMode
			});
			pendingGoogleDriveLink = null;
		},
		onFailure: async (error) => {
			await queryClient.invalidateQueries({ queryKey: keys.remoteSync });
			showErrorToast(error);
		},
		onCancelled: async () => {
			await queryClient.invalidateQueries({ queryKey: keys.remoteSync });
		}
	});
	let lastDismissedSyncConflictSignature: string | null = null;
	let lastInspectedGoogleDriveSignature: string | null = null;
	let googleDriveInspectionRun = 0;
	let isRunningManualGoogleDriveSync = $state(false);

	const activeSyncWorkspace = $derived.by(() => remoteSyncQuery.data?.workspace ?? null);
	const activeSyncAccount = $derived.by(() => {
		const workspace = remoteSyncQuery.data?.workspace;
		if (!workspace || workspace.provider !== 'googleDrive' || !workspace.accountId) {
			return null;
		}

		return remoteSyncQuery.data?.accounts.find((entry) => entry.id === workspace.accountId) ?? null;
	});
	const getEndingSoonNoticeDaysInputValue = () =>
		typeof endingSoonNoticeDaysValue === 'number'
			? String(endingSoonNoticeDaysValue)
			: endingSoonNoticeDaysValue.trim();
	const hasEndingSoonChange = $derived.by(() => {
		const settings = settingsQuery.data;

		return settings
			? getEndingSoonNoticeDaysInputValue() !== String(settings.endingSoonNoticeDays)
			: false;
	});
	const updateProgressPercent = $derived.by(() => {
		if (!updateContentLength || updateContentLength <= 0) {
			return null;
		}

		return Math.min(100, Math.round((updateDownloadedBytes / updateContentLength) * 100));
	});
	const isLinkingGoogleDrive = $derived(linkSession.isLinking);
	const isResolvingLinkConflict = $derived.by(
		() => resolveGoogleDriveLinkMutation.isPending || cancelGoogleDriveLinkMutation.isPending
	);
	const isSyncingGoogleDrive = $derived.by(
		() => syncGoogleDriveWorkspaceMutation.isPending || isRunningManualGoogleDriveSync
	);

	function getGoogleDriveInspectionSignature() {
		if (!activeSyncWorkspace || activeSyncWorkspace.provider !== 'googleDrive') {
			return null;
		}

		return [
			activeSyncWorkspace.id,
			activeSyncWorkspace.accountId ?? '',
			activeSyncAccount?.status ?? '',
			activeSyncAccount?.lastError ?? '',
			activeSyncWorkspace.lastSnapshotAt ?? '',
			activeSyncWorkspace.lastSyncedAt ?? '',
			activeSyncWorkspace.lastRemoteUpdatedAt ?? '',
			activeSyncWorkspace.remoteHeadFileId ?? '',
			activeSyncWorkspace.remoteHeadRevision ?? ''
		].join(':');
	}

	$effect(() => {
		const settings = settingsQuery.data;
		const isMutating = setEndingSoonNoticeDaysMutation.isPending;

		if (!settings || isMutating) {
			return;
		}

		endingSoonNoticeDaysValue = settings.endingSoonNoticeDays;
	});

	$effect(() => {
		if (activeSyncWorkspace?.provider !== 'googleDrive') {
			pendingGoogleDriveLink = null;
			lastDismissedSyncConflictSignature = null;
			lastInspectedGoogleDriveSignature = null;
		}
	});

	$effect(() => {
		const syncState = remoteSyncQuery.data;
		const inspectionSignature = getGoogleDriveInspectionSignature();

		if (!syncState || !inspectionSignature) {
			return;
		}

		if (
			linkSession.session !== null ||
			resolveGoogleDriveLinkMutation.isPending ||
			cancelGoogleDriveLinkMutation.isPending ||
			syncGoogleDriveWorkspaceMutation.isPending ||
			unlinkGoogleDriveWorkspaceMutation.isPending
		) {
			return;
		}

		if (pendingGoogleDriveLink?.conflict?.kind === 'link') {
			lastInspectedGoogleDriveSignature = inspectionSignature;
			return;
		}

		if (
			inspectionSignature === lastInspectedGoogleDriveSignature ||
			inspectionSignature === lastDismissedSyncConflictSignature
		) {
			return;
		}

		lastInspectedGoogleDriveSignature = inspectionSignature;
		const runId = ++googleDriveInspectionRun;

		void (async () => {
			try {
				const preparation = await inspectWorkspaceSyncState(syncState);

				if (runId !== googleDriveInspectionRun) {
					return;
				}

				pendingGoogleDriveLink = preparation?.requiresResolution ? preparation : null;
			} catch {
				if (runId !== googleDriveInspectionRun) {
					return;
				}
			}
		})();
	});

	onDestroy(() => {
		if (availableUpdate) {
			void availableUpdate.close();
		}

		void linkSession.cancel();
	});

	function showErrorToast(error: unknown) {
		const { title, detail } = toErrorMessage(error, $LL);

		toast.error(title, { description: detail ?? undefined });
	}

	function formatTimestamp(value: number | null | undefined) {
		if (!value) {
			return $LL.common.messages.never();
		}

		return formatLocaleDate($locale, value, {
			dateStyle: 'medium',
			timeStyle: 'short'
		});
	}

	function logUpdaterError(action: string, error: unknown) {
		recordDiagnosticError('update.failed', {
			action,
			code: toTauriErrorCode(error),
			error: toErrorDetail(error)
		});
	}

	async function revealDiagnostics() {
		const diagnosticsDir = settingsQuery.data?.diagnosticsDir;

		if (!diagnosticsDir) {
			return;
		}

		try {
			await tauri.opener.revealItemInDir(diagnosticsDir);
		} catch (error) {
			toast.error(toErrorText(error, $LL));
		}
	}

	async function closeAvailableUpdate() {
		if (!availableUpdate) {
			return;
		}

		try {
			await availableUpdate.close();
		} catch {
			/* ignore */
		}
	}

	async function checkForUpdates() {
		if (isCheckingForUpdate || isInstallingUpdate) {
			return;
		}

		isCheckingForUpdate = true;
		updateCheckError = null;
		updateInstallError = null;
		updateInstallComplete = false;
		updateDownloadedBytes = 0;
		updateContentLength = null;

		try {
			const update = await tauri.update.check();

			await closeAvailableUpdate();
			availableUpdate = update;
			hasCheckedForUpdate = true;
		} catch (error) {
			logUpdaterError('check for updates', error);
			updateCheckError = toErrorText(error, $LL);
			hasCheckedForUpdate = true;
		}

		isCheckingForUpdate = false;
	}

	async function installUpdate() {
		const update = availableUpdate;

		if (!update || isInstallingUpdate) {
			return;
		}

		isInstallingUpdate = true;
		updateInstallError = null;
		updateInstallComplete = false;
		updateDownloadedBytes = 0;
		updateContentLength = null;

		try {
			await api.app.update.prepare({ targetVersion: update.version });

			await update.downloadAndInstall((event: UpdaterDownloadEvent) => {
				switch (event.event) {
					case 'Started':
						updateContentLength = event.data.contentLength ?? null;
						updateDownloadedBytes = 0;
						break;
					case 'Progress':
						updateDownloadedBytes += event.data.chunkLength;
						break;
					case 'Finished':
						if (updateContentLength) {
							updateDownloadedBytes = updateContentLength;
						}
						break;
				}
			});

			updateInstallComplete = true;
			availableUpdate = null;
			await update.close();
		} catch (error) {
			logUpdaterError('install update', error);
			updateInstallError = toErrorText(error, $LL);
		}

		isInstallingUpdate = false;
	}

	async function restartApp() {
		try {
			await syncWorkspaceBeforeExit(remoteSyncQuery.data);
			await tauri.window.restart();
		} catch (error) {
			showErrorToast(error);
		}
	}

	async function saveEndingSoonNoticeDays() {
		const days = Number(endingSoonNoticeDaysValue);

		if (!Number.isInteger(days) || days <= 0) {
			toast.error($LL.settings.endingSoonInvalid());
			return;
		}

		try {
			await setEndingSoonNoticeDaysMutation.mutateAsync({ days });
		} catch {
			/* ignore */
		}
	}

	async function snapshotNow() {
		try {
			await createWorkspaceSnapshotMutation.mutateAsync();
		} catch {
			/* ignore */
		}
	}

	async function syncGoogleDriveNow() {
		if (activeSyncWorkspace?.provider !== 'googleDrive' || isRunningManualGoogleDriveSync) {
			return;
		}

		isRunningManualGoogleDriveSync = true;

		try {
			const result = (await syncGoogleDriveWorkspaceMutation.mutateAsync({
				manual: true
			})) as SyncGoogleDriveWorkspaceResult;
			pendingGoogleDriveLink = 'preparation' in result ? result.preparation : null;
		} catch {
			/* ignore */
		} finally {
			isRunningManualGoogleDriveSync = false;
		}
	}

	async function linkGoogleDrive() {
		if (linkSession.isFinalizing) {
			return;
		}

		if (linkSession.session) {
			await linkSession.cancel();
			return;
		}

		try {
			lastDismissedSyncConflictSignature = null;
			pendingGoogleDriveLink = null;
			await linkSession.begin();
		} catch (error) {
			showErrorToast(error);
		}
	}

	async function resolvePendingGoogleDriveLink(resolution: GoogleDriveLinkResolution) {
		if (!pendingGoogleDriveLink) {
			return;
		}

		try {
			lastDismissedSyncConflictSignature = null;
			await resolveGoogleDriveLinkMutation.mutateAsync({
				preparation: pendingGoogleDriveLink,
				resolution
			});
			pendingGoogleDriveLink = null;
		} catch {
			/* ignore */
		}
	}

	async function cancelPendingGoogleDriveLink() {
		if (linkSession.isFinalizing) {
			return;
		}

		if (linkSession.session) {
			await linkSession.cancel();
			return;
		}

		if (!pendingGoogleDriveLink) {
			return;
		}

		try {
			if (shouldDeferWorkspaceConflict(pendingGoogleDriveLink)) {
				lastDismissedSyncConflictSignature = getGoogleDriveInspectionSignature();
				pendingGoogleDriveLink = null;
				return;
			}

			await cancelGoogleDriveLinkMutation.mutateAsync({ preparation: pendingGoogleDriveLink });
			pendingGoogleDriveLink = null;
		} catch {
			/* ignore */
		}
	}

	async function relinkBrokenGoogleDrive() {
		if (pendingGoogleDriveLink?.conflict?.kind !== 'relink' || linkSession.isFinalizing) {
			return;
		}

		try {
			lastDismissedSyncConflictSignature = null;
			const nextState = await resetBrokenGoogleDriveWorkspace(pendingGoogleDriveLink.state);
			queryClient.setQueryData(keys.remoteSync, nextState);
			pendingGoogleDriveLink = null;
			await linkSession.begin();
		} catch (error) {
			showErrorToast(error);
		}
	}

	async function unlinkGoogleDriveWorkspace() {
		disconnectingGoogleDriveAccountId = activeSyncWorkspace?.accountId ?? null;

		try {
			await unlinkGoogleDriveWorkspaceMutation.mutateAsync();
		} catch {
			/* ignore */
		}

		disconnectingGoogleDriveAccountId = null;
	}

	async function changeLocale(next: Locales) {
		if (next === $locale) {
			return;
		}

		const previousLocale = $locale;
		setLocale(next);

		try {
			await api.app.settings.set({ locale: next });
			await settingsQuery.refetch();
		} catch (error) {
			setLocale(previousLocale);
			showErrorToast(error);
		}
	}
</script>

<div class="mx-auto flex w-full max-w-7xl flex-col gap-5 px-5 pt-5 pb-8">
	<div class="flex flex-col gap-1">
		<h1 class="text-3xl font-semibold tracking-tight">{$LL.settings.title()}</h1>
		<p class="text-sm text-muted-foreground">{$LL.settings.description()}</p>
	</div>

	{#if (settingsQuery.isLoading && !settingsQuery.data) || (remoteSyncQuery.isLoading && !remoteSyncQuery.data)}
		<div class="flex min-h-full flex-1 items-center justify-center p-1">
			<div class="flex flex-col items-center gap-3">
				<Spinner class="size-8 text-muted-foreground" />
				<p class="text-sm text-muted-foreground">{$LL.common.messages.loadingSettings()}</p>
			</div>
		</div>
	{:else if settingsQuery.error || remoteSyncQuery.error}
		<Card class={cn('max-w-2xl', settingsCardClass)}>
			<CardHeader class="gap-3 border-b border-border/50 pb-5">
				<CardTitle>{$LL.settings.loadErrorTitle()}</CardTitle>
				<CardDescription>{$LL.settings.loadErrorDescription()}</CardDescription>
			</CardHeader>
			<CardContent class="space-y-4 pt-5">
				<p class="text-sm text-muted-foreground">
					{toErrorText(settingsQuery.error ?? remoteSyncQuery.error, $LL)}
				</p>
				<Button
					onclick={() => {
						void settingsQuery.refetch();
						void remoteSyncQuery.refetch();
					}}
				>
					{$LL.common.actions.retry()}
				</Button>
			</CardContent>
		</Card>
	{:else if settingsQuery.data && remoteSyncQuery.data}
		<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
			<div class={settingsOverviewPanelClass}>
				<p class="text-xs tracking-[0.2em] text-muted-foreground uppercase">
					{$LL.common.labels.appVersion()}
				</p>
				<p class="mt-3 text-lg font-semibold">{settingsQuery.data.version}</p>
			</div>

			<div class={settingsOverviewPanelClass}>
				<p class="text-xs tracking-[0.2em] text-muted-foreground uppercase">
					{$LL.settings.currentWorkspace()}
				</p>
				<p class="mt-3 text-lg font-semibold">
					{activeSyncWorkspace?.name ?? $LL.common.messages.unknown()}
				</p>
			</div>

			<div class={settingsOverviewPanelClass}>
				<p class="text-xs tracking-[0.2em] text-muted-foreground uppercase">
					{$LL.settings.latestSnapshot()}
				</p>
				<p class="mt-3 text-lg font-semibold">
					{formatTimestamp(activeSyncWorkspace?.lastSnapshotAt ?? null)}
				</p>
			</div>

			<div class={settingsOverviewPanelClass}>
				<p class="text-xs tracking-[0.2em] text-muted-foreground uppercase">
					{$LL.settings.localeLabel()}
				</p>
				<p class="mt-3 text-lg font-semibold">{localesMetadata[$locale].label}</p>
			</div>
		</div>

		<div class="grid gap-3 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
			<div class="space-y-3">
				<SettingsLocaleCard currentLocale={$locale} onChange={changeLocale} />

				<SettingsEndingSoonCard
					settings={settingsQuery.data}
					bind:value={endingSoonNoticeDaysValue}
					isPending={setEndingSoonNoticeDaysMutation.isPending}
					hasChange={hasEndingSoonChange}
					onSave={() => void saveEndingSoonNoticeDays()}
				/>
			</div>

			<div class="space-y-3">
				<SettingsUpdatesCard
					version={settingsQuery.data.version}
					{isCheckingForUpdate}
					{isInstallingUpdate}
					{hasCheckedForUpdate}
					{availableUpdate}
					{updateCheckError}
					{updateInstallError}
					{updateInstallComplete}
					{updateDownloadedBytes}
					{updateContentLength}
					{updateProgressPercent}
					onCheckForUpdates={() => void checkForUpdates()}
					onInstallUpdate={() => void installUpdate()}
					onRestartApp={() => void restartApp()}
				/>

				<SettingsSyncCard
					syncState={remoteSyncQuery.data}
					isSnapshotPending={createWorkspaceSnapshotMutation.isPending}
					{isSyncingGoogleDrive}
					{isLinkingGoogleDrive}
					isFinalizingGoogleDriveLink={linkSession.isFinalizing}
					{isResolvingLinkConflict}
					isUnlinkingGoogleDrive={unlinkGoogleDriveWorkspaceMutation.isPending}
					linkConflict={pendingGoogleDriveLink?.conflict ?? null}
					{disconnectingGoogleDriveAccountId}
					onSnapshotNow={() => void snapshotNow()}
					onSyncGoogleDrive={() => void syncGoogleDriveNow()}
					onLinkGoogleDrive={() => void linkGoogleDrive()}
					onLinkKeepLocal={() => void resolvePendingGoogleDriveLink('local')}
					onLinkUseRemote={() => void resolvePendingGoogleDriveLink('remote')}
					onRelinkGoogleDrive={() => void relinkBrokenGoogleDrive()}
					onCancelLinkConflict={() => void cancelPendingGoogleDriveLink()}
					onDisconnectGoogleDrive={() => void unlinkGoogleDriveWorkspace()}
				/>

				<SettingsDiagnosticsCard
					diagnosticsDir={settingsQuery.data.diagnosticsDir}
					onRevealDiagnostics={() => void revealDiagnostics()}
				/>
			</div>
		</div>
	{/if}
</div>
