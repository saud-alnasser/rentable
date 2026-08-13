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

	/**
	 * The trigger's props with the tab index it contributes removed.
	 *
	 * bits-ui gives a context-menu trigger `tabindex: -1` for the `div` it wraps content in by
	 * default, which should not be a tab stop; `mergeProps` keeps that value unless the caller
	 * states one of its own. Spread onto a card that is a link, it takes the card out of the tab
	 * order — so whether a card can be focused stays the card element's own business (ADR 0034).
	 */
	function withoutContributedTabIndex(props: Record<string, unknown>) {
		const cardProps = { ...props };

		delete cardProps.tabindex;

		return cardProps;
	}
</script>

<script lang="ts">
	import * as ContextMenu from '$lib/design/primitive/context-menu';
	import type { Snippet } from 'svelte';

	/**
	 * A record card's own actions, on the gesture the platform already uses for them.
	 *
	 * The card is the trigger rather than sitting inside one, so nothing is added to a row the
	 * list lays out at a declared height. Clicking the card still opens the record (ADR 0025),
	 * and the card decides its own place in the tab order — the menu wrapped around it does not
	 * get a say.
	 *
	 * The gesture is an accelerator and holds nothing a visible control does not; the control
	 * itself arrives with the block that owns a card's markup (ADR 0034).
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
			{@render card(withoutContributedTabIndex(props))}
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
