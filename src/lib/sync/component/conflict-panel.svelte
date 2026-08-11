<script lang="ts">
	import { getConflictPresentation } from '$lib/sync/conflict';
	import type { GoogleDriveLinkConflict } from '$lib/platform/tauri';
	import { Badge } from '$lib/design/primitive/badge';
	import { Button } from '$lib/design/primitive/button';
	import { formatLocaleDate } from '$lib/platform/locale';
	import { cn } from '$lib/design/tailwind.js';
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

	// one table keyed by kind, shared with every other screen that can raise a conflict.
	const presentation = $derived(getConflictPresentation(conflict, $LL));

	// the table says so: a kind offering no remote copy declares no label for taking one.
	const showUseRemote = $derived(presentation.useRemoteLabel !== undefined);

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

<div class={cn('space-y-4 rounded-2xl border bg-card p-4', className)}>
	<div class="space-y-1">
		<p class="text-base font-semibold">{presentation.title}</p>
		<p class="text-sm text-muted-foreground">{presentation.description}</p>
	</div>

	<div class="grid gap-3 lg:grid-cols-2">
		<div class="space-y-3 rounded-2xl border bg-muted p-4">
			<div class="flex items-center justify-between gap-3">
				<p class="font-medium">{$LL.settings.syncLinkConflictLocalTitle()}</p>
				<div class="flex items-center gap-2">
					{#if getLatestSide() === 'local'}
						<Badge variant="secondary">{$LL.settings.syncConflictLatestBadge()}</Badge>
					{/if}
					<Badge variant="outline">{$LL.settings.syncProviderLocal()}</Badge>
				</div>
			</div>
			<p class="text-sm text-muted-foreground">{presentation.localDescription}</p>
			<p class="text-sm text-muted-foreground">
				{$LL.settings.syncLastSnapshotDescription({
					value: formatTimestamp(conflict.localSnapshotAt)
				})}
			</p>
		</div>

		<div class="space-y-3 rounded-2xl border bg-muted p-4">
			<div class="flex items-center justify-between gap-3">
				<p class="font-medium">{$LL.settings.syncLinkConflictRemoteTitle()}</p>
				<div class="flex items-center gap-2">
					{#if getLatestSide() === 'remote'}
						<Badge variant="secondary">{$LL.settings.syncConflictLatestBadge()}</Badge>
					{/if}
					<Badge variant="secondary">{$LL.settings.syncProviderGoogleDrive()}</Badge>
				</div>
			</div>
			<p class="text-sm text-muted-foreground">{presentation.remoteDescription}</p>
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
				{presentation.useRemoteLabel}
			</Button>
		{/if}
		<Button onclick={conflict.kind === 'relink' ? onRelink : onKeepLocal} disabled={isWorking}>
			{presentation.keepLocalLabel}
		</Button>
	</div>
</div>
