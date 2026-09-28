<script lang="ts">
	import { Button } from '@rentable/design/primitive/button/index.js';
	import * as DropdownMenu from '@rentable/design/primitive/dropdown-menu/index.js';
	import * as Tooltip from '@rentable/design/primitive/tooltip/index.js';
	import { cn } from '@rentable/design/tailwind.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import ArrowLeftRightIcon from '@lucide/svelte/icons/arrow-left-right';

	/**
	 * The list's transfer menu: the two directions a set's records travel to and from a file.
	 *
	 * A menu rather than the bare icon it was: the icon could say *export* and nothing else, so a
	 * second format had nowhere to be named and neither had the direction. The groups are the
	 * directions, which is what leaves the import one a place to be added rather than a control to
	 * be rebuilt around it.
	 */
	let {
		listId,
		direction,
		isExporting,
		onExport,
		exportUnavailable,
		onImport,
		importUnavailable
	}: {
		/** What scopes the reason ids, so two lists on one screen name their own. */
		listId: string;
		/** The reading direction, which decides the side a reason stands on. */
		direction: 'ltr' | 'rtl';
		/** Whether an export is being written, which holds both directions until it is. */
		isExporting: boolean;
		/** Ask which file the list becomes. Given only where the list exports. */
		onExport?: () => void;
		/** Why the list cannot be written to a file now, or nothing where it can. */
		exportUnavailable?: string;
		/** Read a file into the list. Given only where the list imports. */
		onImport?: () => void;
		/** Why the list takes no file now, or nothing where it does. */
		importUnavailable?: string;
	} = $props();

	// what names a refused entry to assistive technology, whether or not its tooltip is drawn.
	const transferReasonId = (which: 'export' | 'import') => `${listId}-${which}-reason`;
	// the tooltip trigger's attributes on a menu entry, less the two that would name it something
	// else: its slot, and the button type a trigger carries. As `record-card.svelte` does it.
	const asMenuEntry = (props: Record<string, unknown>) => {
		const hint = { ...props };

		delete hint['data-slot'];
		delete hint.type;

		return hint;
	};
</script>

<!-- one direction of the transfer menu. Where it cannot run it stays in the menu, dimmed and
     refused, and says why beside the entry on hover and focus, as a record's menu entry does: a
     menu's own disabled entry is skipped by the keyboard and ignores the pointer, which would leave
     the reason unreachable ([[rules/interface]], *Guidance*). Refusing the selection also keeps the
     menu open with the reason showing. -->
{#snippet transferEntry(
	which: 'export' | 'import',
	label: string,
	unavailable: string | undefined,
	run: () => void
)}
	{#if unavailable}
		<Tooltip.Root>
			<Tooltip.Trigger>
				{#snippet child({ props: hint })}
					<DropdownMenu.Item
						{...asMenuEntry(hint)}
						data-transfer={which}
						onSelect={(event: Event) => event.preventDefault()}
					>
						{#snippet child({ props })}
							<div
								{...props}
								aria-disabled="true"
								aria-describedby={transferReasonId(which)}
								data-unavailable=""
								class={cn(props.class as string, 'cursor-not-allowed opacity-50')}
							>
								<span class="flex-1 capitalize">{label}</span>
								<span id={transferReasonId(which)} class="sr-only">{unavailable}</span>
							</div>
						{/snippet}
					</DropdownMenu.Item>
				{/snippet}
			</Tooltip.Trigger>
			<Tooltip.Content side={direction === 'rtl' ? 'left' : 'right'} sideOffset={8}>
				<span data-unavailable-reason>{unavailable}</span>
			</Tooltip.Content>
		</Tooltip.Root>
	{:else}
		<DropdownMenu.Item data-transfer={which} disabled={isExporting} onSelect={run}>
			<span class="flex-1 capitalize">{label}</span>
		</DropdownMenu.Item>
	{/if}
{/snippet}

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				variant="outline"
				size="icon-sm"
				aria-label={$LL.common.actions.transferData()}
				disabled={isExporting}
			>
				<!-- both directions, because the control now offers both: an arrow leaving a table said
				     *export* and left the import item under a glyph contradicting it. Two arrows, one
				     each way.

				     Not mirrored in the other reading direction, unlike every directional glyph here: a
				     pair that already points both ways is the same pair reflected, and the class would
				     only swap which arrow is on top. -->
				<ArrowLeftRightIcon />
			</Button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end">
		<!-- the two directions, and nothing else. Which file an export becomes is not a third action
		     beside them; it is a question about one of the two, and it is asked in a dialog of its
		     own once that one is chosen. -->
		{#if onExport}
			{@render transferEntry('export', $LL.common.actions.export(), exportUnavailable, onExport)}
		{/if}

		{#if onImport}
			{@render transferEntry('import', $LL.common.actions.import(), importUnavailable, () =>
				onImport?.()
			)}
		{/if}
	</DropdownMenu.Content>
</DropdownMenu.Root>
