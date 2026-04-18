<script lang="ts">
	import type { GoogleDriveLinkConflict } from '$lib/api/utils/remote-sync-google-drive';
	import { Badge } from '$lib/common/components/fragments/badge';
	import { Button } from '$lib/common/components/fragments/button';
	import { formatLocaleDate } from '$lib/common/utils/locale';
	import { cn } from '$lib/common/utils/tailwind.js';
	import { LL, locale } from '$lib/i18n/i18n-svelte';

	let {
		conflict,
		isWorking,
		showCancel = false,
		cancelLabel,
		onKeepLocal,
		onUseRemote,
		onRelink,
		onCancel,
		class: className
	}: {
		conflict: GoogleDriveLinkConflict;
		isWorking: boolean;
		showCancel?: boolean;
		cancelLabel?: string;
		onKeepLocal: () => void;
		onUseRemote: () => void;
		onRelink?: () => void;
		onCancel?: () => void;
		class?: string;
	} = $props();

	function formatTimestamp(value: number | null) {
		if (!value) {
			return $LL.common.messages.never();
		}

		return formatLocaleDate($locale, value, { dateStyle: 'medium', timeStyle: 'short' });
	}

	function getTitle() {
		if (conflict.kind === 'relink') {
			return $LL.settings.syncRelinkRequiredTitle();
		}

		if (conflict.kind === 'corrupt') {
			return $LL.settings.syncCorruptTitle();
		}

		return conflict.kind === 'sync'
			? $LL.settings.syncConflictTitle()
			: $LL.settings.syncLinkConflictTitle();
	}

	function getDescription() {
		if (conflict.kind === 'relink') {
			return conflict.message ?? $LL.settings.syncRelinkRequiredDescription();
		}

		if (conflict.kind === 'corrupt') {
			return conflict.message ?? $LL.settings.syncCorruptDescription();
		}

		return conflict.kind === 'sync'
			? $LL.settings.syncConflictDescription()
			: $LL.settings.syncLinkConflictDescription();
	}

	function getLocalDescription() {
		if (conflict.kind === 'relink') {
			return $LL.settings.syncRelinkRequiredLocalDescription();
		}

		if (conflict.kind === 'corrupt') {
			return $LL.settings.syncCorruptLocalDescription();
		}

		return conflict.kind === 'sync'
			? $LL.settings.syncConflictLocalDescription()
			: $LL.settings.syncLinkConflictLocalDescription();
	}

	function getRemoteDescription() {
		if (conflict.kind === 'relink') {
			return $LL.settings.syncRelinkRequiredRemoteDescription({ email: conflict.accountEmail });
		}

		if (conflict.kind === 'corrupt') {
			return $LL.settings.syncCorruptRemoteDescription({ email: conflict.accountEmail });
		}

		return conflict.kind === 'sync'
			? $LL.settings.syncConflictRemoteDescription({ email: conflict.accountEmail })
			: $LL.settings.syncLinkConflictRemoteDescription({ email: conflict.accountEmail });
	}

	function getKeepLocalLabel() {
		if (conflict.kind === 'relink') {
			return $LL.settings.syncRelinkRequiredAction();
		}

		if (conflict.kind === 'corrupt') {
			return $LL.settings.syncCorruptKeepLocalAction();
		}

		return conflict.kind === 'sync'
			? $LL.settings.syncConflictKeepLocalAction()
			: $LL.settings.syncLinkKeepLocalAction();
	}

	function getUseRemoteLabel() {
		return conflict.kind === 'sync'
			? $LL.settings.syncConflictUseRemoteAction()
			: $LL.settings.syncLinkUseRemoteAction();
	}

	const showUseRemote = $derived.by(() => conflict.kind === 'sync' || conflict.kind === 'link');

	function getLatestSide() {
		const local = conflict.localSnapshotAt ?? 0;
		const remote = conflict.remoteUpdatedAt ?? 0;

		if (!local && !remote) {
			return null;
		}

		if (local > remote) {
			return 'local' as const;
		}

		if (remote > local) {
			return 'remote' as const;
		}

		return null;
	}
</script>

<div class={cn('space-y-4 rounded-[1.25rem] border border-border/70 bg-card/35 p-4', className)}>
	<div class="space-y-1">
		<p class="text-base font-semibold">{getTitle()}</p>
		<p class="text-sm text-muted-foreground">{getDescription()}</p>
	</div>

	<div class="grid gap-3 lg:grid-cols-2">
		<div class="space-y-3 rounded-2xl border border-border/65 bg-background/60 p-4">
			<div class="flex items-center justify-between gap-3">
				<p class="font-medium">{$LL.settings.syncLinkConflictLocalTitle()}</p>
				<div class="flex items-center gap-2">
					{#if getLatestSide() === 'local'}
						<Badge variant="secondary">{$LL.settings.syncConflictLatestBadge()}</Badge>
					{/if}
					<Badge variant="outline">{$LL.settings.syncProviderLocal()}</Badge>
				</div>
			</div>
			<p class="text-sm text-muted-foreground">{getLocalDescription()}</p>
			<p class="text-sm text-muted-foreground">
				{$LL.settings.syncLastSnapshotDescription({
					value: formatTimestamp(conflict.localSnapshotAt)
				})}
			</p>
		</div>

		<div class="space-y-3 rounded-2xl border border-border/65 bg-background/60 p-4">
			<div class="flex items-center justify-between gap-3">
				<p class="font-medium">{$LL.settings.syncLinkConflictRemoteTitle()}</p>
				<div class="flex items-center gap-2">
					{#if getLatestSide() === 'remote'}
						<Badge variant="secondary">{$LL.settings.syncConflictLatestBadge()}</Badge>
					{/if}
					<Badge variant="secondary">{$LL.settings.syncProviderGoogleDrive()}</Badge>
				</div>
			</div>
			<p class="text-sm text-muted-foreground">{getRemoteDescription()}</p>
			<p class="text-sm text-muted-foreground">
				{$LL.settings.syncLastRemoteDescription({
					value: formatTimestamp(conflict.remoteUpdatedAt)
				})}
			</p>
			{#if conflict.remoteFilename}
				<p class="text-xs break-all text-muted-foreground">{conflict.remoteFilename}</p>
			{/if}
		</div>
	</div>

	<div class="flex flex-col gap-2 sm:flex-row sm:justify-end">
		{#if showCancel && onCancel}
			<Button variant="outline" onclick={onCancel} disabled={isWorking}>
				{cancelLabel ?? $LL.common.actions.cancel()}
			</Button>
		{/if}
		{#if showUseRemote}
			<Button variant="outline" onclick={onUseRemote} disabled={isWorking}>
				{getUseRemoteLabel()}
			</Button>
		{/if}
		<Button onclick={conflict.kind === 'relink' ? onRelink : onKeepLocal} disabled={isWorking}>
			{getKeepLocalLabel()}
		</Button>
	</div>
</div>
