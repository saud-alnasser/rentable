<script lang="ts" module>
	import type EllipsisIcon from '@lucide/svelte/icons/ellipsis';

	type IconComponent = typeof EllipsisIcon;

	/**
	 * One entry of a card's menu, in the vocabulary the row menus already use.
	 *
	 * `onSelect` rather than a click handler because a menu item is reached by the keyboard as
	 * well as by the pointer, and only this one fires for both.
	 */
	export type RecordCardAction = {
		label: string;
		icon: IconComponent;
		variant?: 'default' | 'destructive';
		onSelect: () => void;
	};
</script>

<script lang="ts">
	import * as ContextMenu from '$lib/design/primitive/context-menu';
	import type { Snippet } from 'svelte';

	/**
	 * A record card's own actions, on the gesture the platform already uses for them.
	 *
	 * The card is the trigger rather than sitting inside one: a directory card is one line high
	 * and already carries a name, its identifiers and a row of figures, so there is no room in
	 * it for controls — and wrapping it in an element of its own would put a box inside a
	 * virtualized row that lays its cards out at a declared height (ADR 0033).
	 *
	 * Every action here is also a control on the record's own page. That is the condition the
	 * decision rests on: the gesture is an accelerator, so a reader who never finds it loses
	 * nothing, and clicking the card still opens the record (ADR 0025).
	 */
	let {
		actions,
		card
	}: {
		/** what the record offers, in the order its own page offers them. */
		actions: RecordCardAction[];
		/** the card, rendered with the props that make it this menu's trigger. */
		card: Snippet<[Record<string, unknown>]>;
	} = $props();
</script>

<ContextMenu.Root>
	<ContextMenu.Trigger>
		{#snippet child({ props })}
			{@render card(props)}
		{/snippet}
	</ContextMenu.Trigger>

	<ContextMenu.Content class="min-w-[12rem]">
		{#each actions as action (action.label)}
			{@const Icon = action.icon}
			<ContextMenu.Item variant={action.variant} onSelect={action.onSelect} class="capitalize">
				<Icon class="size-4" />
				<span class="min-w-0 flex-1 truncate">{action.label}</span>
			</ContextMenu.Item>
		{/each}
	</ContextMenu.Content>
</ContextMenu.Root>
