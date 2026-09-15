<script lang="ts">
	import type { RecordCardAction } from '#lib/block/record-card.svelte';
	import { Button } from '#lib/primitive/button/index.js';
	import * as DropdownMenu from '#lib/primitive/dropdown-menu/index.js';
	import * as Tooltip from '#lib/primitive/tooltip/index.js';
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
	import { mergeProps } from 'bits-ui';

	/**
	 * Every act a row offers, behind one control the reader can see.
	 *
	 * A row that has no page to open still has acts, and a cluster of glyphs revealed on hover
	 * promises none of them: the reader has to sweep the row to find out there was anything
	 * there. So the row carries a single control at its end and the acts read as a menu, which
	 * is the visible route a record card already offers (ADR 0034) drawn for a row instead of a
	 * card. The row itself opens nothing (ADR 0025); this is the route.
	 *
	 * **The acts arrive in groups, and a group is a kind of act rather than a count.** What
	 * somebody is called, what they may do, their way in, and leaving are four answers to four
	 * different questions, and a menu of nine items with no seams is a list the reader reads from
	 * the top every time. The separator between groups is the whole of that grouping: a heading
	 * per group would spend a line naming what the items say themselves.
	 *
	 * **A group with nothing in it draws nothing, not even its separator.** The caller gates each
	 * act on what the session holds, so a group empties on an ordinary reader rather than on a
	 * mistake, and a menu that opens on a rule of its own is how a reader learns something was
	 * withheld.
	 *
	 * It is the secondary of the surface it sits on (_Semantics are secondary_, 60): outlined and
	 * quiet, so a list of twenty rows reads as twenty people rather than as twenty controls, while
	 * the section's own primary stays the one solid thing on the surface.
	 */
	let {
		label,
		groups
	}: {
		/** what the control opens, for the tooltip and for a screen reader. */
		label: string;
		/** the acts, in the order the reader meets them, grouped by the kind of act each is. */
		groups: RecordCardAction[][];
	} = $props();

	const offered = $derived(groups.filter((group) => group.length > 0));
</script>

{#snippet entry(action: RecordCardAction)}
	{@const Icon = action.icon}
	<Icon class="size-4" />
	<span class="min-w-0 flex-1 truncate">{action.label}</span>
{/snippet}

{#if offered.length > 0}
	<DropdownMenu.Root>
		<Tooltip.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props: menu })}
					<Tooltip.Trigger>
						{#snippet child({ props: tooltip })}
							<!--
								one control names the row's acts for both readings: the tooltip for a
								pointer, and the accessible name for whoever never sees it. Both are the
								caller's one label, so a row cannot say one thing on hover and another to a
								screen reader.

								`mergeProps` chains what both roots put on this element, which a spread
								would drop one half of; the menu's props come last so the element reads as
								what pressing it does.
							-->
							<Button
								{...mergeProps(tooltip, menu)}
								variant="outline"
								size="icon-sm"
								class="rounded-full bg-secondary"
								aria-label={label}
							>
								<EllipsisIcon class="size-4" />
								<span class="sr-only">{label}</span>
							</Button>
						{/snippet}
					</Tooltip.Trigger>
				{/snippet}
			</DropdownMenu.Trigger>
			<Tooltip.Content>{label}</Tooltip.Content>
		</Tooltip.Root>

		<DropdownMenu.Content align="end" class="min-w-[12rem]">
			{#each offered as group, index (index)}
				{#if index > 0}
					<DropdownMenu.Separator />
				{/if}

				{#each group as action (action.label)}
					<DropdownMenu.Item
						variant={action.variant}
						disabled={action.disabled}
						onSelect={action.onSelect}
						class="capitalize"
						{...action.attributes}
					>
						{@render entry(action)}
					</DropdownMenu.Item>
				{/each}
			{/each}
		</DropdownMenu.Content>
	</DropdownMenu.Root>
{/if}
