<script lang="ts">
	import type {
		RemoteSyncAccount,
		RemoteSyncProvider,
		RemoteSyncState,
		RemoteSyncWorkspace
	} from '$lib/api/tauri';
	import type { GoogleDriveLinkConflict } from '$lib/api/utils/remote-sync-google-drive';
	import {
		AlertDialog,
		AlertDialogAction,
		AlertDialogCancel,
		AlertDialogContent,
		AlertDialogDescription,
		AlertDialogFooter,
		AlertDialogHeader,
		AlertDialogTitle
	} from '$lib/common/components/fragments/alert-dialog';
	import { Badge, type BadgeVariant } from '$lib/common/components/fragments/badge';
	import { Button } from '$lib/common/components/fragments/button';
	import { Callout } from '$lib/common/components/fragments/callout';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/common/components/fragments/card';
	import { formatLocaleDate } from '$lib/common/utils/locale';
	import { cn } from '$lib/common/utils/tailwind.js';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import GoogleDriveLinkConflictPanel from '$lib/resources/sync/components/google-drive-link-conflict-panel.svelte';
	import HardDriveIcon from '@lucide/svelte/icons/hard-drive';
	import LinkIcon from '@lucide/svelte/icons/link';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import UnlinkIcon from '@lucide/svelte/icons/unlink';

	let {
		syncState,
		isSnapshotPending,
		isSyncingGoogleDrive,
		isLinkingGoogleDrive,
		isFinalizingGoogleDriveLink,
		isResolvingLinkConflict,
		isUnlinkingGoogleDrive,
		linkConflict,
		disconnectingGoogleDriveAccountId,
		onSnapshotNow,
		onSyncGoogleDrive,
		onLinkGoogleDrive,
		onLinkKeepLocal,
		onLinkUseRemote,
		onRelinkGoogleDrive,
		onCancelLinkConflict,
		onDisconnectGoogleDrive
	}: {
		syncState: RemoteSyncState;
		isSnapshotPending: boolean;
		isSyncingGoogleDrive: boolean;
		isLinkingGoogleDrive: boolean;
		isFinalizingGoogleDriveLink: boolean;
		isResolvingLinkConflict: boolean;
		isUnlinkingGoogleDrive: boolean;
		linkConflict: GoogleDriveLinkConflict | null;
		disconnectingGoogleDriveAccountId: string | null;
		onSnapshotNow: () => void;
		onSyncGoogleDrive: () => void;
		onLinkGoogleDrive: () => void;
		onLinkKeepLocal: () => void;
		onLinkUseRemote: () => void;
		onRelinkGoogleDrive: () => void;
		onCancelLinkConflict: () => void;
		onDisconnectGoogleDrive: () => void;
	} = $props();

	const settingsCardClass = 'border-border/70 bg-card/65 shadow-xl backdrop-blur-xl';
	const settingsInsetPanelClass =
		'rounded-[1.25rem] border border-border/70 bg-background/60 p-4 text-start shadow-sm backdrop-blur-md';

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

	function formatTimestamp(value: number | null | undefined) {
		if (!value) {
			return $LL.common.messages.never();
		}

		return formatLocaleDate($locale, value, {
			dateStyle: 'medium',
			timeStyle: 'short'
		});
	}

	function getConflictDescription() {
		if (!linkConflict) {
			return null;
		}

		if (linkConflict.kind === 'sync') {
			return $LL.settings.syncConflictShortDescription();
		}

		if (linkConflict.kind === 'corrupt') {
			return linkConflict.message ?? $LL.settings.syncCorruptShortDescription();
		}

		if (linkConflict.kind === 'relink') {
			return linkConflict.message ?? $LL.settings.syncRelinkRequiredShortDescription();
		}

		return $LL.settings.syncLinkConflictShortDescription();
	}

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

	function formatDriveUsage(account: RemoteSyncAccount | null) {
		if (!account) {
			return null;
		}

		const used = formatBytes(account.driveUsageBytes);
		const total = formatBytes(account.driveQuotaBytes);

		if (!used || !total) {
			return null;
		}

		return `${used} / ${total}`;
	}

	function getLatestSnapshotTimestamp(workspace: RemoteSyncWorkspace) {
		const snapshotAt = workspace.lastSnapshotAt ?? 0;
		const syncedAt = workspace.provider === 'googleDrive' ? (workspace.lastSyncedAt ?? 0) : 0;
		const latest = Math.max(snapshotAt, syncedAt);

		return latest > 0 ? latest : null;
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

<Card class={settingsCardClass}>
	<CardHeader class="gap-3 border-b border-border/50 pb-5">
		<CardTitle>{$LL.settings.syncTitle()}</CardTitle>
		<CardDescription>{$LL.settings.syncDescription()}</CardDescription>
	</CardHeader>
	<CardContent class="space-y-5 pt-5">
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
						onclick={onLinkGoogleDrive}
						disabled={isResolvingLinkConflict || isFinalizingGoogleDriveLink}
					>
						{isFinalizingGoogleDriveLink
							? $LL.common.actions.linking()
							: $LL.common.actions.cancel()}
					</Button>
				</div>
			</Callout>
		{/if}

		{#if activeWorkspace}
			<div class={cn(settingsInsetPanelClass, 'space-y-4')}>
				<div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
					<div class="min-w-0 flex-1 space-y-4 text-start">
						<div class="flex min-w-0 items-start gap-3 rtl:flex-row-reverse">
							<div
								class="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary"
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

						<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
							<div class="rounded-2xl border border-border/60 bg-background/70 p-3">
								<p class="text-xs tracking-[0.18em] text-muted-foreground uppercase">
									{$LL.settings.latestSnapshot()}
								</p>
								<p class="mt-2 text-sm font-medium">
									{formatTimestamp(getLatestSnapshotTimestamp(activeWorkspace))}
								</p>
								<p class="mt-1 text-xs text-muted-foreground">
									{$LL.settings.syncLastSnapshotDescription({
										value: formatTimestamp(activeWorkspace.lastSnapshotAt ?? null)
									})}
								</p>
							</div>

							<div class="rounded-2xl border border-border/60 bg-background/70 p-3">
								<p class="text-xs tracking-[0.18em] text-muted-foreground uppercase">
									{$LL.common.actions.syncNow()}
								</p>
								<p class="mt-2 text-sm font-medium">
									{formatTimestamp(activeWorkspace.lastSyncedAt ?? null)}
								</p>
								<p class="mt-1 text-xs text-muted-foreground">
									{activeWorkspace.provider === 'googleDrive'
										? $LL.settings.syncLastRemoteDescription({
												value: formatTimestamp(activeWorkspace.lastRemoteUpdatedAt ?? null)
											})
										: $LL.settings.syncLinkDescription()}
								</p>
							</div>

							<div
								class="rounded-2xl border border-border/60 bg-background/70 p-3 sm:col-span-2 xl:col-span-1"
							>
								<p class="text-xs tracking-[0.18em] text-muted-foreground uppercase">
									{activeWorkspace.provider === 'googleDrive'
										? $LL.settings.syncProviderGoogleDrive()
										: $LL.settings.currentWorkspace()}
								</p>
								<p class="mt-2 text-sm font-medium">
									{activeWorkspace.provider === 'googleDrive'
										? (formatBytes(activeAccount?.appUsageBytes) ?? $LL.common.messages.unknown())
										: getProviderLabel(activeWorkspace.provider)}
								</p>
								<p class="mt-1 text-xs text-muted-foreground">
									{activeWorkspace.provider === 'googleDrive'
										? formatDriveUsage(activeAccount)
											? $LL.settings.syncTotalDriveUsageDescription({
													value: formatDriveUsage(activeAccount) ?? ''
												})
											: $LL.settings.syncProviderGoogleDrive()
										: $LL.settings.syncAutomationDescription()}
								</p>
							</div>
						</div>
					</div>

					<div class="w-full max-w-md space-y-3 text-start">
						{#if linkConflict}
							<p class="text-sm text-muted-foreground">
								{getConflictDescription()}
							</p>
						{:else if activeWorkspace.provider === 'googleDrive' && activeAccount}
							<div class="space-y-1 text-sm text-muted-foreground">
								{#if formatBytes(activeAccount.appUsageBytes)}
									<p>
										{$LL.settings.syncAppDriveUsageDescription({
											value: formatBytes(activeAccount.appUsageBytes) ?? '0 B'
										})}
									</p>
								{/if}
								{#if formatDriveUsage(activeAccount)}
									<p>
										{$LL.settings.syncTotalDriveUsageDescription({
											value: formatDriveUsage(activeAccount) ?? ''
										})}
									</p>
								{/if}
							</div>
							<div class="grid gap-2 sm:grid-cols-2">
								<Button
									onclick={onSyncGoogleDrive}
									disabled={isSyncingGoogleDrive || isGoogleDriveBusy}
								>
									<RefreshCwIcon class="size-4" />
									{isSyncingGoogleDrive
										? $LL.common.actions.working()
										: $LL.common.actions.syncNow()}
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
								<Button onclick={onSnapshotNow} disabled={isSnapshotPending || isGoogleDriveBusy}>
									<HardDriveIcon class="size-4" />
									{isSnapshotPending ? $LL.common.actions.creating() : $LL.settings.snapshotNow()}
								</Button>
								<Button
									onclick={onLinkGoogleDrive}
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
						showCancel={linkConflict.kind === 'link'}
						onCancel={onCancelLinkConflict}
						onKeepLocal={onLinkKeepLocal}
						onUseRemote={onLinkUseRemote}
						onRelink={onRelinkGoogleDrive}
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
									onDisconnectGoogleDrive();
								}}
							>
								{$LL.common.actions.unlink()}
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			</div>
		{/if}
	</CardContent>
</Card>
