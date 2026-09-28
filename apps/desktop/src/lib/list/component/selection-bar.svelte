<script lang="ts" generics="TData extends { id: string }">
	import RecordActionControl from '@rentable/design/block/record-action-control.svelte';
	import { toNarrowedName } from '@rentable/design/csv.js';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import * as Tooltip from '@rentable/design/primitive/tooltip/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import XIcon from '@lucide/svelte/icons/x';
	import type { Snippet } from 'svelte';

	/**
	 * What the reader can do to the records they selected, above the rows.
	 *
	 * Present only while something is selected, and above the rows rather than floating over them:
	 * what it offers is destructive, and a bar that covers the last row is a bar that hides one of
	 * the records it is about to act on.
	 */
	let {
		selected,
		actions,
		selectedRows,
		exportName,
		onExport,
		onClear
	}: {
		/** The ids selected, in the order the list is showing them. */
		selected: readonly string[];
		/** What the surface offers for them. */
		actions?: Snippet<[readonly string[]]>;
		/** The records the selection names that the list is still showing. */
		selectedRows: TData[];
		/** What the list's export calls its file, or nothing where the list offers no export. */
		exportName?: string;
		/** Ask which file these rows become, under this name. */
		onExport: (rows: TData[], name: string) => void;
		/** Put the selection down. */
		onClear: () => void;
	} = $props();
</script>

<div
	class="flex shrink-0 flex-wrap items-center gap-3 rounded-2xl bg-secondary px-3 py-2 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1"
>
	<span class="text-sm font-medium" aria-live="polite">
		{$LL.common.table.recordsSelected({ count: selected.length })}
	</span>

	<div class="ms-auto flex flex-wrap items-center gap-1.5">
		{@render actions?.(selected)}

		<!-- the list's own export, aimed at the selection instead of at everything on screen. It
		     belongs to this block rather than to the concept beside it: the columns and the file are
		     the list's, and every list that exports gets this by exporting.

		     Absent rather than disabled where the selection names nothing this list is still
		     showing, so there is no control here that would write an empty file. -->
		{#if exportName !== undefined && selectedRows.length > 0}
			<RecordActionControl
				label={$LL.common.actions.exportSelection()}
				icon={DownloadIcon}
				onclick={() =>
					onExport(
						selectedRows,
						// the list's own naming, applied to one more narrowing. A file of the whole
						// directory and a file of the nine records picked out of it are otherwise the
						// same name, and the second replaces the first unless the reader notices, which
						// is the reason `toNarrowedName` exists at all.
						toNarrowedName(exportName, [
							$LL.common.table.recordsSelected({ count: selectedRows.length })
						])
					)}
			/>
		{/if}

		<!-- the same treatment the concept's own controls wear, so the row reads as one cluster of
		     actions rather than as icons with a word bolted on the end. -->
		<Tooltip.Root>
			<Tooltip.Trigger>
				{#snippet child({ props })}
					<Button
						{...props}
						variant="outline"
						size="icon-sm"
						class="rounded-full bg-secondary"
						aria-label={$LL.common.actions.clearSelection()}
						onclick={onClear}
					>
						<XIcon class="size-4" />
						<span class="sr-only">{$LL.common.actions.clearSelection()}</span>
					</Button>
				{/snippet}
			</Tooltip.Trigger>
			<Tooltip.Content side="top" sideOffset={8}>
				{$LL.common.actions.clearSelection()}
			</Tooltip.Content>
		</Tooltip.Root>
	</div>
</div>
