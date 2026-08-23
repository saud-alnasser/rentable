<script lang="ts" module>
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';

	type IconComponent = typeof EllipsisIcon;

	/**
	 * One entry of a record card's actions, in the order the record's own surfaces offer them.
	 *
	 * `onSelect` is the menus' own selection event, which is what lets a single list drive both of
	 * a card's routes without either holding a vocabulary of its own.
	 */
	export type RecordCardAction = {
		label: string;
		icon: IconComponent;
		variant?: 'default' | 'destructive';
		onSelect: () => void;
	};
</script>

<script lang="ts">
	// `href` is a route the concept already resolved, so the base is on it once — resolving it here
	// would put it on twice.
	/* eslint-disable svelte/no-navigation-without-resolve */
	import * as ContextMenu from '@rentable/design/primitive/context-menu/index.js';
	import * as DropdownMenu from '@rentable/design/primitive/dropdown-menu/index.js';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import { recordCard } from '$lib/design/block/list.svelte';
	import { cn } from '@rentable/design/tailwind.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import type { Snippet } from 'svelte';

	/**
	 * A record in a list: the card that opens it, and the record's actions by both of the routes a
	 * card offers them — a quiet control on the card, and the platform's context gesture
	 * (ADR 0034). Both read one list, so a card cannot offer one thing to a right-click and
	 * another to the control.
	 *
	 * The record's link covers the card rather than wrapping it, which is what lets a control sit
	 * above it instead of being swallowed by its click target, and it is the card's single tab
	 * stop — the container carries the gesture and is deliberately not one (ADR 0025).
	 *
	 * `content` renders as the card's own flex children, so what each concept puts in the middle
	 * stays that concept's. **Each of them needs `pointer-events-none relative`**: without the
	 * first, the content swallows the click that opens the record; without the second it sits
	 * under the link rather than over it.
	 */
	let {
		href,
		label,
		actions,
		content,
		class: className
	}: {
		/** where the card opens. */
		href: string;
		/** what the link is called, since it carries no text of its own. */
		label: string;
		/** what the record offers. A card with none shows neither route. */
		actions: RecordCardAction[];
		/** the card's own content, as flex children. */
		content: Snippet;
		/** the card's own spacing, where it differs from the shared rhythm. */
		class?: string;
	} = $props();
</script>

{#snippet entry(action: RecordCardAction)}
	{@const Icon = action.icon}
	<Icon class="size-4" />
	<span class="min-w-0 flex-1 truncate">{action.label}</span>
{/snippet}

{#snippet card(triggerProps: Record<string, unknown>)}
	<div
		{...triggerProps}
		class={cn(
			'relative flex h-full items-center gap-3 px-4 hover:bg-muted/40',
			recordCard,
			className
		)}
	>
		<a
			{href}
			aria-label={label}
			class="absolute inset-0 rounded-[inherit] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
		></a>

		{@render content()}

		{#if actions.length > 0}
			<div class="relative flex size-8 shrink-0 items-center justify-center">
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<!-- tertiary, and deliberately quiet: the reader came for the record, so the control
							     is discoverable without competing with what the card says (_Semantics are
							     secondary_, 60). This is the only home for the treatment now — the two lists
							     that carried their own copy of it read this block instead. -->
							<Button
								{...props}
								variant="ghost"
								size="icon-sm"
								class="relative rounded-full bg-secondary p-0 transition-[background-color] hover:bg-accent"
							>
								<span class="sr-only">{$LL.common.actions.openMenu()}</span>
								<EllipsisIcon class="size-4" />
							</Button>
						{/snippet}
					</DropdownMenu.Trigger>

					<DropdownMenu.Content align="end" class="min-w-[12rem]">
						{#each actions as action (action.label)}
							<DropdownMenu.Item
								variant={action.variant}
								onSelect={action.onSelect}
								class="capitalize"
							>
								{@render entry(action)}
							</DropdownMenu.Item>
						{/each}
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			</div>
		{/if}
	</div>
{/snippet}

{#if actions.length > 0}
	<ContextMenu.Root>
		<ContextMenu.Trigger>
			{#snippet child({ props })}
				{@render card(props)}
			{/snippet}
		</ContextMenu.Trigger>

		<ContextMenu.Content class="min-w-[12rem]">
			{#each actions as action (action.label)}
				<ContextMenu.Item variant={action.variant} onSelect={action.onSelect} class="capitalize">
					{@render entry(action)}
				</ContextMenu.Item>
			{/each}
		</ContextMenu.Content>
	</ContextMenu.Root>
{:else}
	<!-- a card with nothing to offer claims neither route: taking the gesture and answering it
	     with an empty menu would also suppress the one the webview would otherwise show. -->
	{@render card({})}
{/if}
