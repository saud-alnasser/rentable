<script lang="ts" module>
	import type { RecordCardAction } from '#lib/block/record-card.svelte';

	/**
	 * What an unavailable entry is marked with, over the menu's own attributes, so assistive
	 * technology hears it refused. Written after the menu's attributes, because the menu marks
	 * every entry it was not told to disable as enabled.
	 */
	export const unavailableEntry = {
		'aria-disabled': 'true',
		'data-unavailable': ''
	} as const;

	/**
	 * The tooltip trigger's attributes, less the two that would say the entry is something else: its
	 * slot, which names what the entry is to every surface and test that reads it, and the button
	 * type a trigger carries, which a menu entry is not.
	 */
	export const asEntry = (props: Record<string, unknown>) => {
		const hint = { ...props };

		delete hint['data-slot'];
		delete hint.type;

		return hint;
	};

	/** how an unavailable entry looks: dimmed, as a disabled one is, and not pressable to the eye. */
	export const unavailableLook = 'opacity-50 cursor-not-allowed';

	/** whether this entry opens a new group, and so has a separator drawn above it. */
	export const opensGroup = (actions: RecordCardAction[], index: number) =>
		index > 0 && actions[index].group !== actions[index - 1].group;

	/**
	 * An unavailable entry is refused here rather than by the menu: a menu's own disabled entry is
	 * skipped by the keyboard and ignores the pointer, which would leave its reason unreachable.
	 * Preventing the selection also keeps the menu open, with the reason still showing.
	 */
	export const refuse = (event: Event) => event.preventDefault();
</script>

<script lang="ts">
	import { Button } from '#lib/primitive/button/index.js';
	import * as DropdownMenu from '#lib/primitive/dropdown-menu/index.js';
	import * as Tooltip from '#lib/primitive/tooltip/index.js';
	import { useDesignContract } from '#lib/strings.js';
	import { cn } from '#lib/tailwind.js';
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
	import type { Snippet } from 'svelte';

	/**
	 * The record menu: the quiet control that opens a record's secondary acts, and the entries it
	 * holds, an unavailable one refused with its reason beside it. Internal to this package, and the
	 * one home of what a record card and a settings row share, so neither block exports its
	 * internals to the other (effort 846 ticket 29, against [[contexts/desktop/components]]'s *A
	 * block before a primitive*). A concept draws the block, never this.
	 *
	 * **The control is tertiary, and deliberately quiet**: the reader came for the record, so it is
	 * discoverable without competing with what the card or the row says (_Semantics are secondary_,
	 * 60). It is named by `label`, which is the block's: the card's contract word, or the row's own
	 * words naming what it acts on.
	 *
	 * It reads the design contract for the side the reason stands on, and is drawn only where there
	 * is an act to offer, so a block that offers none reads nothing.
	 */
	let {
		actions,
		label,
		entry,
		attributes
	}: {
		/** what the record offers, in order; a separator is drawn wherever the group changes. */
		actions: RecordCardAction[];
		/** the control's accessible name. */
		label: string;
		/** what an entry draws after the menu's own attributes: its glyph and its words as written. */
		entry?: Snippet<[RecordCardAction]>;
		/** what the block marks the control with, the `data-*` a surface is read by. */
		attributes?: Record<string, string>;
	} = $props();

	const contract = useDesignContract();

	// the reason stands beside the entry, on the side the menu reads towards.
	const reasonSide = $derived(contract.direction === 'rtl' ? 'left' : 'right');
</script>

{#snippet plain(action: RecordCardAction)}
	{@const Icon = action.icon}
	<Icon class="size-4" />
	<span class="min-w-0 flex-1 truncate">{action.label}</span>
{/snippet}

{#snippet words(action: RecordCardAction)}
	{@render (entry ?? plain)(action)}
{/snippet}

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				{...attributes}
				variant="ghost"
				size="icon-sm"
				class="relative rounded-full bg-secondary p-0 transition-[background-color] hover:bg-accent"
			>
				<span class="sr-only">{label}</span>
				<EllipsisIcon class="size-4" />
			</Button>
		{/snippet}
	</DropdownMenu.Trigger>

	<DropdownMenu.Content align="end" class="min-w-[12rem]">
		{#each actions as action, index (action.label)}
			{#if opensGroup(actions, index)}
				<DropdownMenu.Separator />
			{/if}
			{#if action.unavailable}
				<Tooltip.Root>
					<Tooltip.Trigger>
						{#snippet child({ props: hint })}
							<DropdownMenu.Item
								{...asEntry(hint)}
								variant={action.tone === 'error' ? 'destructive' : 'default'}
								onSelect={refuse}
								{...action.attributes}
							>
								{#snippet child({ props })}
									<div
										{...props}
										{...unavailableEntry}
										class={cn(props.class as string, unavailableLook)}
									>
										{@render words(action)}
									</div>
								{/snippet}
							</DropdownMenu.Item>
						{/snippet}
					</Tooltip.Trigger>
					<Tooltip.Content side={reasonSide} sideOffset={8}>
						<span class="block max-w-xs" data-unavailable-reason>{action.unavailable}</span>
					</Tooltip.Content>
				</Tooltip.Root>
			{:else}
				<DropdownMenu.Item
					variant={action.tone === 'error' ? 'destructive' : 'default'}
					disabled={action.disabled}
					onSelect={action.onSelect}
					{...action.attributes}
				>
					{@render words(action)}
				</DropdownMenu.Item>
			{/if}
		{/each}
	</DropdownMenu.Content>
</DropdownMenu.Root>
