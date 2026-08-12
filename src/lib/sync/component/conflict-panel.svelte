<script lang="ts">
	import { Button } from '$lib/design/primitive/button';
	import * as Tooltip from '$lib/design/primitive/tooltip';
	import { cn } from '$lib/design/tailwind.js';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import type { GoogleDriveLinkConflict } from '$lib/platform/tauri';
	import { formatLocaleDate } from '$lib/platform/locale';
	import { getConflictPresentation } from '$lib/sync/conflict';
	import CloudIcon from '@lucide/svelte/icons/cloud';
	import HardDriveIcon from '@lucide/svelte/icons/hard-drive';

	/**
	 * The question a diverged workspace raises, and its answers.
	 *
	 * It leads with the question because that is what the reader was stopped for — at startup
	 * they are trying to open the application, not audit it. What lies behind the question —
	 * when each side was last written, which is newer, what the remote copy is called — sits
	 * behind the two chips, where it is reachable without leaving the surface. The whole of it
	 * is on each chip's accessible name as well as in its tooltip, because the choice below is
	 * irreversible and the evidence for it cannot be hover-only.
	 */
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
		/** whether an answer is being carried out. Which one is this panel's own to remember. */
		isWorking: boolean;
		showCancel?: boolean;
		cancelLabel?: string;
		onKeepLocal: () => void;
		onUseRemote: () => void;
		onRelink?: () => void;
		onCancel?: () => void;
		class?: string;
	} = $props();

	// one table keyed by kind, shared with every other screen that can raise a conflict, so the
	// same conflict reads identically wherever it is raised.
	const presentation = $derived(getConflictPresentation(conflict, $LL));

	// the table says so: a kind offering no remote copy declares no label for taking one.
	const showUseRemote = $derived(presentation.useRemoteLabel !== undefined);

	// which answer was pressed, so the control that started the work is the one that says so
	// rather than every control saying it at once. The panel owns the buttons, so it is the
	// only place that knows — and it forgets once the work is over.
	let pressed = $state<'keepLocal' | 'useRemote' | 'relink' | 'cancel' | null>(null);

	$effect(() => {
		if (!isWorking) {
			pressed = null;
		}
	});

	function formatTimestamp(value: number | null) {
		if (!value) {
			return $LL.common.messages.never();
		}

		return formatLocaleDate($locale, value, { dateStyle: 'medium', timeStyle: 'short' });
	}

	const newerSide = $derived.by(() => {
		const local = conflict.localSnapshotAt ?? 0;
		const remote = conflict.remoteUpdatedAt ?? 0;

		if (local === remote) return null;

		return local > remote ? ('local' as const) : ('remote' as const);
	});

	const sides = $derived([
		{
			key: 'local' as const,
			icon: HardDriveIcon,
			name: $LL.settings.syncProviderLocal(),
			detail: [
				presentation.localDescription,
				$LL.settings.syncLastSnapshotDescription({
					value: formatTimestamp(conflict.localSnapshotAt)
				})
			]
		},
		{
			key: 'remote' as const,
			icon: CloudIcon,
			name: $LL.settings.syncProviderGoogleDrive(),
			detail: [
				presentation.remoteDescription,
				$LL.settings.syncLastRemoteDescription({
					value: formatTimestamp(conflict.remoteUpdatedAt)
				}),
				conflict.remoteFilename
			].filter((line): line is string => Boolean(line))
		}
	]);
</script>

<div class={cn('space-y-4 rounded-2xl border bg-card p-4', className)}>
	<div class="space-y-1">
		<p class="text-base font-semibold">{presentation.title}</p>
		<p class="text-sm text-muted-foreground">{presentation.description}</p>
	</div>

	<div class="flex flex-wrap items-center gap-2">
		{#each sides as side (side.key)}
			{@const label = [
				side.name,
				newerSide === side.key ? $LL.settings.syncConflictLatestBadge() : null,
				...side.detail
			]
				.filter(Boolean)
				.join(' — ')}
			<Tooltip.Root>
				<Tooltip.Trigger>
					{#snippet child({ props })}
						{@const Icon = side.icon}
						<span
							{...props}
							class="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground"
						>
							<Icon class="size-3.5 shrink-0" aria-hidden="true" />
							<span aria-hidden="true">{side.name}</span>
							{#if newerSide === side.key}
								<span class="font-medium text-foreground" aria-hidden="true">
									{$LL.settings.syncConflictLatestBadge()}
								</span>
							{/if}
							<!-- the whole detail is the chip's accessible name: a tooltip nobody can hover
							     is not where the evidence for an irreversible choice may live. -->
							<span class="sr-only">{label}</span>
						</span>
					{/snippet}
				</Tooltip.Trigger>
				<Tooltip.Content side="top" sideOffset={8} class="max-w-72">
					<span class="flex flex-col gap-1 text-start">
						{#each side.detail as line (line)}
							<span class="break-all">{line}</span>
						{/each}
					</span>
				</Tooltip.Content>
			</Tooltip.Root>
		{/each}
	</div>

	<div class="flex flex-col gap-2 sm:flex-row sm:justify-end">
		{#if showCancel && onCancel}
			<Button
				variant="outline"
				disabled={isWorking}
				onclick={() => {
					pressed = 'cancel';
					onCancel();
				}}
			>
				{pressed === 'cancel'
					? $LL.common.actions.working()
					: (cancelLabel ?? $LL.common.actions.cancel())}
			</Button>
		{/if}
		{#if showUseRemote}
			<Button
				variant="outline"
				disabled={isWorking}
				onclick={() => {
					pressed = 'useRemote';
					onUseRemote();
				}}
			>
				{pressed === 'useRemote' ? $LL.common.actions.working() : presentation.useRemoteLabel}
			</Button>
		{/if}
		{#if conflict.kind === 'relink'}
			<Button
				disabled={isWorking}
				onclick={() => {
					pressed = 'relink';
					onRelink?.();
				}}
			>
				{pressed === 'relink' ? $LL.common.actions.working() : presentation.keepLocalLabel}
			</Button>
		{:else}
			<Button
				disabled={isWorking}
				onclick={() => {
					pressed = 'keepLocal';
					onKeepLocal();
				}}
			>
				{pressed === 'keepLocal' ? $LL.common.actions.working() : presentation.keepLocalLabel}
			</Button>
		{/if}
	</div>
</div>
