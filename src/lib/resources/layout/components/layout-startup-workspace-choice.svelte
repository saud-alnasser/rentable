<script lang="ts">
	import type { RemoteSyncAccount, RemoteSyncState, RemoteSyncWorkspace } from '$lib/api/tauri';
	import type { GoogleDriveLinkConflict } from '$lib/api/utils/remote-sync-google-drive';
	import { Badge } from '$lib/common/components/fragments/badge';
	import { Button } from '$lib/common/components/fragments/button';
	import { Callout } from '$lib/common/components/fragments/callout';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/common/components/fragments/card';
	import * as Tooltip from '$lib/common/components/fragments/tooltip';
	import { formatLocaleDate } from '$lib/common/utils/locale';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import GoogleDriveLinkConflictPanel from '$lib/resources/sync/components/google-drive-link-conflict-panel.svelte';
	import CloudIcon from '@lucide/svelte/icons/cloud';
	import FolderOpenIcon from '@lucide/svelte/icons/folder-open';
	import HardDriveIcon from '@lucide/svelte/icons/hard-drive';

	let {
		syncState,
		isWorking,
		isLinkingGoogleDrive,
		isFinalizingGoogleDriveLink,
		errorMessage,
		linkConflict,
		onOpenLocal,
		onLinkGoogleDrive,
		onCancelGoogleDriveLink,
		onLinkKeepLocal,
		onLinkUseRemote,
		onRelinkGoogleDrive,
		onCancelLinkConflict
	}: {
		syncState: RemoteSyncState;
		isWorking: boolean;
		isLinkingGoogleDrive: boolean;
		isFinalizingGoogleDriveLink: boolean;
		errorMessage: string | null;
		linkConflict: GoogleDriveLinkConflict | null;
		onOpenLocal: () => void;
		onLinkGoogleDrive: () => void;
		onCancelGoogleDriveLink: () => void;
		onLinkKeepLocal: () => void;
		onLinkUseRemote: () => void;
		onRelinkGoogleDrive: () => void;
		onCancelLinkConflict: () => void;
	} = $props();

	const activeWorkspace = $derived.by(() => syncState.workspace);
	const activeAccount = $derived.by(() =>
		activeWorkspace.accountId
			? (syncState.accounts.find((account) => account.id === activeWorkspace.accountId) ?? null)
			: null
	);

	function formatTimestamp(value: number | null | undefined) {
		if (!value) {
			return $LL.common.messages.never();
		}

		return formatLocaleDate($locale, value, { dateStyle: 'medium', timeStyle: 'short' });
	}

	function getInitials(workspace: RemoteSyncWorkspace | null, account: RemoteSyncAccount | null) {
		const source = account?.displayName || workspace?.name || 'WS';
		return source
			.split(/\s+/)
			.map((part) => part.trim())
			.filter(Boolean)
			.slice(0, 2)
			.map((part) => part[0]?.toUpperCase() ?? '')
			.join('');
	}

	function getLatestSnapshotTimestamp(workspace: RemoteSyncWorkspace) {
		const snapshotAt = workspace.lastSnapshotAt ?? 0;
		const syncedAt = workspace.provider === 'googleDrive' ? (workspace.lastSyncedAt ?? 0) : 0;
		const latest = Math.max(snapshotAt, syncedAt);

		return latest > 0 ? latest : null;
	}
</script>

<div class="flex min-h-full flex-1 items-center justify-center p-1">
	<Card class="w-full max-w-2xl gap-4">
		<CardHeader>
			<CardTitle>
				{linkConflict
					? linkConflict.kind === 'sync'
						? $LL.settings.syncConflictTitle()
						: linkConflict.kind === 'relink'
							? $LL.settings.syncRelinkRequiredTitle()
							: linkConflict.kind === 'corrupt'
								? $LL.settings.syncCorruptTitle()
								: $LL.settings.syncLinkConflictTitle()
					: $LL.layout.startup.accountChoiceTitle()}
			</CardTitle>
			<CardDescription>
				{linkConflict
					? linkConflict.kind === 'sync'
						? $LL.settings.syncConflictDescription()
						: linkConflict.kind === 'relink'
							? (linkConflict.message ?? $LL.settings.syncRelinkRequiredDescription())
							: linkConflict.kind === 'corrupt'
								? (linkConflict.message ?? $LL.settings.syncCorruptDescription())
								: $LL.settings.syncLinkConflictDescription()
					: $LL.layout.startup.accountChoiceDescription()}
			</CardDescription>
		</CardHeader>

		<CardContent class="space-y-4">
			{#if activeWorkspace}
				<div class="rounded-[1.25rem] border border-border/65 bg-background/55 p-4 shadow-sm">
					<div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
						<div class="flex min-w-0 items-center gap-3">
							<div
								class="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary"
							>
								{getInitials(activeWorkspace, activeAccount)}
							</div>
							<div class="min-w-0 space-y-1">
								<p class="text-lg font-semibold">{activeWorkspace.name}</p>
								<p class="flex items-center gap-2 text-sm text-muted-foreground">
									<Tooltip.Root>
										<Tooltip.Trigger><HardDriveIcon class="size-4 shrink-0" /></Tooltip.Trigger>
										<Tooltip.Content>{$LL.settings.latestSnapshot()}</Tooltip.Content>
									</Tooltip.Root>
									{$LL.settings.latestSnapshot()}: {formatTimestamp(
										getLatestSnapshotTimestamp(activeWorkspace)
									)}
								</p>
							</div>
						</div>

						<div class="flex flex-wrap gap-2">
							<Tooltip.Root>
								<Tooltip.Trigger>
									<Badge variant="outline">
										{activeWorkspace.provider === 'googleDrive'
											? $LL.settings.syncWorkspaceStatusSynced()
											: $LL.settings.syncProviderLocal()}
									</Badge>
								</Tooltip.Trigger>
								<Tooltip.Content>{activeAccount?.email ?? activeWorkspace.name}</Tooltip.Content>
							</Tooltip.Root>
						</div>
					</div>
				</div>
			{/if}

			{#if errorMessage}
				<p class="text-sm text-destructive">{errorMessage}</p>
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
				</Callout>
			{/if}

			{#if linkConflict}
				<GoogleDriveLinkConflictPanel
					conflict={linkConflict}
					{isWorking}
					showCancel={true}
					cancelLabel={linkConflict.kind === 'sync' ||
					linkConflict.kind === 'corrupt' ||
					linkConflict.kind === 'relink'
						? $LL.settings.syncConflictDeferAction()
						: $LL.common.actions.cancel()}
					onCancel={onCancelLinkConflict}
					onKeepLocal={onLinkKeepLocal}
					onUseRemote={onLinkUseRemote}
					onRelink={onRelinkGoogleDrive}
				/>
			{:else if isLinkingGoogleDrive}
				<div class="grid gap-3 sm:grid-cols-2">
					<Button
						variant="outline"
						onclick={onOpenLocal}
						disabled={isWorking || isFinalizingGoogleDriveLink}
					>
						<FolderOpenIcon class="size-4" />
						{$LL.common.actions.openLocal()}
					</Button>
					<Button
						onclick={onCancelGoogleDriveLink}
						disabled={isWorking || isFinalizingGoogleDriveLink}
					>
						<CloudIcon class="size-4" />
						{isFinalizingGoogleDriveLink
							? $LL.common.actions.linking()
							: $LL.common.actions.cancel()}
					</Button>
				</div>
			{:else}
				<div class="grid gap-3 sm:grid-cols-2">
					<Button variant="outline" onclick={onOpenLocal} disabled={isWorking}>
						<FolderOpenIcon class="size-4" />
						{$LL.common.actions.openLocal()}
					</Button>
					<Button onclick={onLinkGoogleDrive} disabled={isWorking || !syncState.googleDriveReady}>
						<CloudIcon class="size-4" />
						{isWorking ? $LL.common.actions.linking() : $LL.common.actions.link()}
					</Button>
				</div>
			{/if}
		</CardContent>
	</Card>
</div>
