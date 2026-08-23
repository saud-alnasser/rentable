<script lang="ts">
	import { Button } from '@rentable/design/primitive/button/index.js';
	import * as Dialog from '@rentable/design/primitive/dialog/index.js';
	import { EXPORT_FORMATS, type ExportFormat } from '$lib/design/csv';
	import { LL } from '$lib/i18n/i18n-svelte';
	import CheckIcon from '@lucide/svelte/icons/check';
	import FileSpreadsheetIcon from '@lucide/svelte/icons/file-spreadsheet';
	import FileTextIcon from '@lucide/svelte/icons/file-text';

	/**
	 * Which file a list should be written as.
	 *
	 * The format is asked for here rather than being an item on the menu, because it is not a
	 * second action: choosing `csv` and choosing `xlsx` do the same thing to the same rows, and a
	 * menu that lists them as siblings of *import* says otherwise. The menu names the two
	 * directions; this names the file.
	 *
	 * A choice with a default, not a fork. It opens on the format most things read, so a reader
	 * with no opinion presses one control and is done.
	 */
	let {
		open,
		onOpenChange,
		onExport,
		isExporting = false
	}: {
		open: boolean;
		/**
		 * asked to close.
		 *
		 * A callback rather than a binding, because the caller holds more than a boolean: which
		 * rows this export is of is taken at the moment a control is pressed, and one state saying
		 * both is one fewer way for the two to come apart.
		 */
		onOpenChange: (value: boolean) => void;
		/** write the list out as the chosen format. */
		onExport: (format: ExportFormat) => Promise<void> | void;
		isExporting?: boolean;
	} = $props();

	/** csv first, and chosen by default: it is what everything opens, including the other one. */
	let chosen = $state<ExportFormat>('csv');

	const icons = {
		csv: FileTextIcon,
		xlsx: FileSpreadsheetIcon
	} satisfies Record<ExportFormat, unknown>;
</script>

<Dialog.Root {open} {onOpenChange}>
	<Dialog.Content class="w-full max-w-md">
		<Dialog.Header>
			<Dialog.Title class="capitalize">{$LL.common.actions.export()}</Dialog.Title>
			<Dialog.Description>{$LL.common.export.description()}</Dialog.Description>
		</Dialog.Header>

		<div class="flex flex-col gap-2 px-6 py-5">
			{#each EXPORT_FORMATS as format (format)}
				{@const Icon = icons[format]}
				{@const isChosen = chosen === format}
				<!-- the whole row is the control, not a dot beside a label: the target is the size of
				     the thing being chosen, and what is chosen reads as chosen rather than as ticked. -->
				<button
					type="button"
					onclick={() => (chosen = format)}
					aria-pressed={isChosen}
					class="flex cursor-pointer items-center gap-3 rounded-2xl border p-4 text-start transition-colors duration-200 {isChosen
						? 'border-primary bg-primary/10'
						: 'border-transparent bg-muted hover:bg-muted/70'}"
				>
					<Icon class="size-5 shrink-0 {isChosen ? 'text-primary' : 'text-muted-foreground'}" />
					<span class="min-w-0 flex-1 text-sm font-medium">{$LL.common.formats[format]()}</span>
					{#if isChosen}
						<CheckIcon class="size-4 shrink-0 text-primary" />
					{/if}
				</button>
			{/each}
		</div>

		<Dialog.Footer>
			<Button
				variant="ghost"
				disabled={isExporting}
				onclick={() => onOpenChange(false)}
				class="w-full sm:w-auto"
			>
				{$LL.common.actions.cancel()}
			</Button>
			<Button
				disabled={isExporting}
				onclick={async () => {
					await onExport(chosen);
					onOpenChange(false);
				}}
				class="w-full sm:w-auto"
			>
				{isExporting ? $LL.common.actions.working() : $LL.common.actions.export()}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
