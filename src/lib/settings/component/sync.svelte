<script lang="ts">
	import { getConflictPresentation } from '$lib/sync/conflict';
	import type {
		GoogleDriveConflictResolution,
		RemoteSyncAccount,
		RemoteSyncProvider,
		RemoteSyncState,
		RemoteSyncWorkspace
	} from '$lib/platform/tauri';
	import {
		AlertDialog,
		AlertDialogAction,
		AlertDialogCancel,
		AlertDialogContent,
		AlertDialogDescription,
		AlertDialogFooter,
		AlertDialogHeader,
		AlertDialogTitle
	} from '$lib/design/primitive/alert-dialog';
	import { Badge, type BadgeVariant } from '$lib/design/primitive/badge';
	import { Button } from '$lib/design/primitive/button';
	import { Callout } from '$lib/design/primitive/callout';
	import { formatLocaleDate } from '$lib/platform/locale';
	import { cn } from '$lib/design/tailwind.js';
	import { showErrorToast } from '$lib/error/toast';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import {
		keys,
		useCreateWorkspaceSnapshot,
		useDismissPendingConflict,
		useInspectWorkspaceSyncState,
		useRelinkPendingConflict,
		useResolveGoogleDriveLink,
		useResolvePendingConflict,
		useSyncGoogleDriveWorkspace,
		useUnlinkGoogleDriveWorkspace,
		type SyncGoogleDriveWorkspaceResult
	} from '$lib/settings/query';
	import ConflictDismiss from '$lib/sync/component/conflict-dismiss.svelte';
	import GoogleDriveLinkConflictPanel from '$lib/sync/component/conflict-panel.svelte';
	import { LinkSession } from '$lib/sync/link-session.svelte';
	import { workspaceConflictSignature } from '$lib/sync/pending-conflict';
	import { pendingConflict } from '$lib/sync/pending-conflict.svelte';
	import HardDriveIcon from '@lucide/svelte/icons/hard-drive';
	import LinkIcon from '@lucide/svelte/icons/link';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import UnlinkIcon from '@lucide/svelte/icons/unlink';
	import { useQueryClient } from '@tanstack/svelte-query';
	import { onDestroy } from 'svelte';

	let { syncState }: { syncState: RemoteSyncState } = $props();

	const queryClient = useQueryClient();
	const createWorkspaceSnapshotMutation = useCreateWorkspaceSnapshot();
	const resolveGoogleDriveLinkMutation = useResolveGoogleDriveLink();
	const resolvePendingConflictMutation = useResolvePendingConflict();
	const dismissPendingConflictMutation = useDismissPendingConflict();
	const relinkPendingConflictMutation = useRelinkPendingConflict();
	const syncGoogleDriveWorkspaceMutation = useSyncGoogleDriveWorkspace();
	const unlinkGoogleDriveWorkspaceMutation = useUnlinkGoogleDriveWorkspace();
	const inspectWorkspaceSyncStateMutation = useInspectWorkspaceSyncState();
	const settingsInsetPanelClass = 'rounded-2xl border bg-muted p-4 text-start';

	let disconnectingGoogleDriveAccountId = $state<string | null>(null);
	let isRunningManualGoogleDriveSync = $state(false);
	const linkSession = new LinkSession({
		onState: (state) => {
			queryClient.setQueryData(keys.remoteSync, state);
		},
		onResolutionRequired: (preparation) => {
			pendingConflict.present(preparation);
		},
		resolve: async () => {
			await resolveGoogleDriveLinkMutation.mutateAsync();
			pendingConflict.clear();
		},
		onFailure: async (error) => {
			await queryClient.invalidateQueries({ queryKey: keys.remoteSync });
			showErrorToast(error, $LL);
		},
		onCancelled: async () => {
			await queryClient.invalidateQueries({ queryKey: keys.remoteSync });
		}
	});

	// deliberately not reactive: the inspection effect both reads and writes
	// this, so making it reactive would make it re-run itself.
	let lastInspectedGoogleDriveSignature: string | null = null;
	let googleDriveInspectionRun = 0;

	const isSnapshotPending = $derived(createWorkspaceSnapshotMutation.isPending);
	const isLinkingGoogleDrive = $derived(linkSession.isLinking);
	const isFinalizingGoogleDriveLink = $derived(linkSession.isFinalizing);
	const isUnlinkingGoogleDrive = $derived(unlinkGoogleDriveWorkspaceMutation.isPending);
	const linkConflict = $derived(pendingConflict.conflict);
	const isResolvingLinkConflict = $derived.by(
		() => resolveGoogleDriveLinkMutation.isPending || pendingConflict.isWorking
	);
	const isSyncingGoogleDrive = $derived.by(
		() => syncGoogleDriveWorkspaceMutation.isPending || isRunningManualGoogleDriveSync
	);

	const activeWorkspace = $derived.by(() => syncState.workspace);
	const accountsById = $derived.by(
		() => new Map(syncState.accounts.map((account) => [account.id, account]))
	);
	const activeAccount = $derived.by(() =>
		activeWorkspace.accountId ? (accountsById.get(activeWorkspace.accountId) ?? null) : null
	);
	const isGoogleDriveBusy = $derived.by(
		() =>
			isLinkingGoogleDrive ||
			isResolvingLinkConflict ||
			isUnlinkingGoogleDrive ||
			disconnectingGoogleDriveAccountId !== null
	);
	const isGoogleDriveUnavailable = $derived.by(() => !syncState.googleDriveReady);
	let isUnlinkDialogOpen = $state(false);

	const conflictSignature = $derived(workspaceConflictSignature(syncState));

	$effect(() => {
		if (activeWorkspace.provider !== 'googleDrive') {
			pendingConflict.clear();
			pendingConflict.forget();
			lastInspectedGoogleDriveSignature = null;
		}
	});

	$effect(() => {
		const inspectionSignature = conflictSignature;

		if (!inspectionSignature) {
			return;
		}

		if (
			linkSession.isLinking ||
			resolveGoogleDriveLinkMutation.isPending ||
			pendingConflict.isWorking ||
			syncGoogleDriveWorkspaceMutation.isPending ||
			unlinkGoogleDriveWorkspaceMutation.isPending
		) {
			return;
		}

		if (pendingConflict.conflict?.kind === 'link') {
			lastInspectedGoogleDriveSignature = inspectionSignature;
			return;
		}

		if (
			inspectionSignature === lastInspectedGoogleDriveSignature ||
			pendingConflict.isDismissed(inspectionSignature)
		) {
			return;
		}

		lastInspectedGoogleDriveSignature = inspectionSignature;
		const runId = ++googleDriveInspectionRun;

		void (async () => {
			try {
				const preparation = await inspectWorkspaceSyncStateMutation.mutateAsync(syncState);

				if (runId !== googleDriveInspectionRun) {
					return;
				}

				pendingConflict.present(preparation);
			} catch {
				if (runId !== googleDriveInspectionRun) {
					return;
				}
			}
		})();
	});

	onDestroy(() => {
		void linkSession.cancel();
	});

	async function snapshotNow() {
		try {
			await createWorkspaceSnapshotMutation.mutateAsync();
		} catch {
			/* ignore */
		}
	}

	async function syncGoogleDriveNow() {
		if (activeWorkspace.provider !== 'googleDrive' || isRunningManualGoogleDriveSync) {
			return;
		}

		isRunningManualGoogleDriveSync = true;

		try {
			const result = (await syncGoogleDriveWorkspaceMutation.mutateAsync({
				manual: true
			})) as SyncGoogleDriveWorkspaceResult;
			const preparation = 'preparation' in result ? result.preparation : null;

			// the user asked for this sync, so its answer is not one they have waved away.
			pendingConflict.forget();
			pendingConflict.present(preparation);
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

		if (linkSession.isAuthorizing) {
			await linkSession.cancel();
			return;
		}

		pendingConflict.forget();
		pendingConflict.clear();
		linkSession.begin();
	}

	async function resolvePendingGoogleDriveLink(resolution: GoogleDriveConflictResolution) {
		try {
			await resolvePendingConflictMutation.mutateAsync(resolution);
		} catch {
			/* ignore */
		}
	}

	async function cancelPendingGoogleDriveLink() {
		if (linkSession.isFinalizing) {
			return;
		}

		if (linkSession.isAuthorizing) {
			await linkSession.cancel();
			return;
		}

		try {
			await dismissPendingConflictMutation.mutateAsync();
		} catch {
			/* ignore */
		}
	}

	async function relinkBrokenGoogleDrive() {
		if (linkSession.isFinalizing) {
			return;
		}

		try {
			if (await relinkPendingConflictMutation.mutateAsync()) {
				linkSession.begin();
			}
		} catch {
			/* ignore */
		}
	}

	async function unlinkGoogleDriveWorkspace() {
		disconnectingGoogleDriveAccountId = activeWorkspace.accountId ?? null;

		try {
			await unlinkGoogleDriveWorkspaceMutation.mutateAsync();
		} catch {
			/* ignore */
		}

		disconnectingGoogleDriveAccountId = null;
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

	// the same table every other screen that can raise a conflict reads. This was an eighth
	// parallel ladder over the four kinds, in its own wording set.
	const conflictPresentation = $derived(
		linkConflict ? getConflictPresentation(linkConflict, $LL) : undefined
	);

	function getProviderLabel(provider: RemoteSyncProvider) {
		return provider === 'googleDrive'
			? $LL.settings.syncProviderGoogleDrive()
			: $LL.settings.syncProviderLocal();
	}

	function getAvatarLabel(workspace: RemoteSyncWorkspace, account: RemoteSyncAccount | null) {
		const source = account?.displayName || workspace.name;
		return getInitials(source, 'WS');
	}

	function getInitials(source: string, fallback: string) {
		const parts = source
			.split(/\s+/)
			.map((part) => part.trim())
			.filter(Boolean)
			.slice(0, 2);

		return parts.map((part) => part[0]?.toUpperCase() ?? '').join('') || fallback;
	}

	function formatBytes(value: number | null | undefined) {
		if (value === null || value === undefined || value < 0) {
			return null;
		}

		const units = ['B', 'KB', 'MB', 'GB', 'TB'];
		let size = value;
		let unitIndex = 0;

		while (size >= 1024 && unitIndex < units.length - 1) {
			size /= 1024;
			unitIndex += 1;
		}

		const digits = size >= 10 || unitIndex === 0 ? 0 : 1;
		return `${new Intl.NumberFormat($locale, {
			maximumFractionDigits: digits,
			minimumFractionDigits: 0
		}).format(size)} ${units[unitIndex]}`;
	}

	function getWorkspaceStatus(
		workspace: RemoteSyncWorkspace,
		account: RemoteSyncAccount | null
	): { label: string; variant: BadgeVariant } {
		if (workspace.provider !== 'googleDrive') {
			return { label: $LL.settings.syncProviderLocal(), variant: 'secondary' };
		}

		if (
			linkConflict ||
			workspace.lastError ||
			account?.lastError ||
			account?.status === 'needsReconnect'
		) {
			return { label: $LL.settings.syncAccountStatusNeedsReconnect(), variant: 'destructive' };
		}

		if (isLinkingGoogleDrive || account?.status === 'pending') {
			return { label: $LL.settings.syncAccountStatusPending(), variant: 'secondary' };
		}

		return { label: $LL.settings.syncWorkspaceStatusSynced(), variant: 'default' };
	}
</script>

<!-- no heading row of its own: the group above is already called workspace, and the row said
     "workspace" under it and then listed the controls that follow. -->
<div class="space-y-5">
	<Callout variant="info">
		<strong>{$LL.settings.syncAutomationTitle()}</strong>
		<div class="mt-1 text-sm text-muted-foreground">
			{$LL.settings.syncAutomationDescription()}
		</div>
	</Callout>

	{#if !syncState.googleDriveReady}
		<Callout variant="warning">{$LL.settings.syncGoogleDrivePending()}</Callout>
	{/if}

	{#if isLinkingGoogleDrive}
		<Callout variant="info">
			<strong>
				{isFinalizingGoogleDriveLink
					? $LL.settings.syncLinkFinalizingTitle()
					: $LL.settings.syncLinkPendingTitle()}
			</strong>
			<div class="mt-1 text-sm text-current/80">
				{isFinalizingGoogleDriveLink
					? $LL.settings.syncLinkFinalizingDescription()
					: $LL.settings.syncLinkPendingDescription()}
			</div>
			<div class="mt-3">
				<Button
					variant="outline"
					onclick={() => void linkGoogleDrive()}
					disabled={isResolvingLinkConflict || isFinalizingGoogleDriveLink}
				>
					{isFinalizingGoogleDriveLink ? $LL.common.actions.linking() : $LL.common.actions.cancel()}
				</Button>
			</div>
		</Callout>
	{/if}

	{#if activeWorkspace}
		<div class={cn(settingsInsetPanelClass, 'space-y-4')}>
			<!-- abandoning a half-finished link leaves this panel, not the conflict card inside it,
			     so it is this card's corner control. Only a link in progress can be abandoned —
			     the other three kinds describe a workspace that is already diverged. -->
			{#if linkConflict?.kind === 'link'}
				<div class="flex justify-end">
					<ConflictDismiss
						label={$LL.common.actions.cancel()}
						disabled={isGoogleDriveBusy}
						onDismiss={() => void cancelPendingGoogleDriveLink()}
					/>
				</div>
			{/if}

			<div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
				<div class="min-w-0 flex-1 space-y-4 text-start">
					<div class="flex min-w-0 items-start gap-3 rtl:flex-row-reverse">
						<div
							class="flex size-12 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-foreground"
						>
							{getAvatarLabel(activeWorkspace, activeAccount)}
						</div>
						<div class="min-w-0 flex-1 space-y-2">
							<div class="flex flex-wrap items-center gap-2">
								<p class="text-lg font-semibold">{activeWorkspace.name}</p>
								{#if activeWorkspace.provider === 'googleDrive'}
									<Badge variant="outline">{getProviderLabel(activeWorkspace.provider)}</Badge>
									<Badge variant={getWorkspaceStatus(activeWorkspace, activeAccount).variant}>
										{getWorkspaceStatus(activeWorkspace, activeAccount).label}
									</Badge>
								{/if}
							</div>
							<p class="text-sm text-muted-foreground">
								{activeAccount?.email ?? getProviderLabel(activeWorkspace.provider)}
							</p>
						</div>
					</div>

					<!-- each fact once: the header already carries the provider and the account, so what is
					     left is when this workspace was last written and how much room it takes. -->
					<dl class="flex flex-wrap gap-x-6 gap-y-2 text-sm">
						<div class="min-w-0">
							<dt class="text-xs tracking-[0.18em] text-muted-foreground uppercase">
								{$LL.settings.latestSnapshot()}
							</dt>
							<dd class="mt-1 font-medium">
								{formatTimestamp(activeWorkspace.lastSnapshotAt ?? null)}
							</dd>
						</div>

						{#if activeWorkspace.provider === 'googleDrive'}
							<div class="min-w-0">
								<dt class="text-xs tracking-[0.18em] text-muted-foreground uppercase">
									{$LL.common.labels.lastSyncTime()}
								</dt>
								<dd class="mt-1 font-medium">
									{formatTimestamp(activeWorkspace.lastSyncedAt ?? null)}
								</dd>
							</div>

							<div class="min-w-0">
								<dt class="text-xs tracking-[0.18em] text-muted-foreground uppercase">
									{$LL.settings.syncProviderGoogleDrive()}
								</dt>
								<dd class="mt-1 font-medium">
									{formatBytes(activeAccount?.appUsageBytes) ?? $LL.common.messages.unknown()}
								</dd>
							</div>
						{/if}
					</dl>
				</div>

				<div class="w-full max-w-md space-y-3 text-start">
					{#if linkConflict}
						<p class="text-sm text-muted-foreground">
							{conflictPresentation?.shortDescription}
						</p>
					{:else if activeWorkspace.provider === 'googleDrive' && activeAccount}
						<!-- the usage figures are stated once, in the panel above that owns them. They
						     were repeated here as well, sixty lines apart, saying nothing the second time. -->
						<div class="grid gap-2 sm:grid-cols-2">
							<Button
								onclick={() => void syncGoogleDriveNow()}
								disabled={isSyncingGoogleDrive || isGoogleDriveBusy}
							>
								<RefreshCwIcon class="size-4" />
								{isSyncingGoogleDrive ? $LL.common.actions.working() : $LL.common.actions.syncNow()}
							</Button>
							<Button
								variant="outline"
								onclick={() => {
									isUnlinkDialogOpen = true;
								}}
								disabled={isGoogleDriveBusy || isGoogleDriveUnavailable}
							>
								<UnlinkIcon class="size-4" />
								{isUnlinkingGoogleDrive || disconnectingGoogleDriveAccountId !== null
									? $LL.common.actions.working()
									: $LL.common.actions.unlink()}
							</Button>
						</div>
						<p class="text-xs text-muted-foreground">{$LL.settings.syncUnlinkDescription()}</p>
					{:else}
						<p class="text-sm text-muted-foreground">{$LL.settings.syncLinkDescription()}</p>
						<div class="grid gap-2 sm:grid-cols-2">
							<Button
								onclick={() => void snapshotNow()}
								disabled={isSnapshotPending || isGoogleDriveBusy}
							>
								<HardDriveIcon class="size-4" />
								{isSnapshotPending ? $LL.common.actions.creating() : $LL.settings.snapshotNow()}
							</Button>
							<Button
								onclick={() => void linkGoogleDrive()}
								disabled={isResolvingLinkConflict ||
									isFinalizingGoogleDriveLink ||
									isGoogleDriveUnavailable}
								variant="outline"
							>
								<LinkIcon class="size-4" />
								{isLinkingGoogleDrive
									? isFinalizingGoogleDriveLink
										? $LL.common.actions.linking()
										: $LL.common.actions.cancel()
									: $LL.common.actions.link()}
							</Button>
						</div>
					{/if}
				</div>
			</div>

			{#if linkConflict}
				<GoogleDriveLinkConflictPanel
					conflict={linkConflict}
					isWorking={isGoogleDriveBusy}
					onKeepLocal={() => void resolvePendingGoogleDriveLink('local')}
					onUseRemote={() => void resolvePendingGoogleDriveLink('remote')}
					onRelink={() => void relinkBrokenGoogleDrive()}
				/>
			{/if}

			{#if activeWorkspace.lastError || activeAccount?.lastError}
				<Callout variant="warning">
					{activeWorkspace.lastError ?? activeAccount?.lastError}
				</Callout>
			{/if}

			<AlertDialog bind:open={isUnlinkDialogOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{$LL.settings.syncUnlinkDialogTitle()}</AlertDialogTitle>
						<AlertDialogDescription>
							{$LL.settings.syncUnlinkDialogDescription()}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={isGoogleDriveBusy}>
							{$LL.common.actions.cancel()}
						</AlertDialogCancel>
						<AlertDialogAction
							disabled={isGoogleDriveBusy}
							onclick={() => {
								isUnlinkDialogOpen = false;
								void unlinkGoogleDriveWorkspace();
							}}
						>
							{$LL.common.actions.unlink()}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	{/if}
</div>
