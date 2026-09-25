<script lang="ts" module>
	import type { RecordActionTone } from '#lib/block/record-action-control.svelte';
	import type { ShortcutCombination } from '#lib/shortcut.js';
	import { toTitleCase } from '#lib/title-case.js';
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';

	type IconComponent = typeof EllipsisIcon;

	/**
	 * What a record wears to read as a card in a list.
	 *
	 * The list owns the geometry between cards and the concept owns what a card holds, so the
	 * surface itself is declared here and worn by the concept's own anchor — the anchor is the
	 * click target, and a treatment painted by the list onto a wrapper would put the elevation on
	 * something the reader cannot press.
	 *
	 * It carries resting elevation rather than lifting only on hover, which is the answer a
	 * prototype gave against the real lists: a small shadow is not a per-row claim about
	 * importance, it is what makes a row read as an object at all — and a hover that has already
	 * been told these are objects is free to say only *this one* (_Use shadows to convey
	 * elevation_, 180). The ring is not decoration and not the book's: it is silent on dark mode,
	 * where a shadow against a dark ground reads as almost nothing, and the ring is what separates
	 * the card there.
	 *
	 * *It was declared by the list block until #782, and the edge ran the wrong way: a card that
	 * carries no domain imported it from the one component that does. It sits on the component
	 * that wears it now, and the list reads it from here.*
	 *
	 * The lift is gated with its transition rather than left to snap: under reduced motion a hovered
	 * card still deepens its shadow and does not move. Nothing here answers focus, so moving through
	 * a list from the keyboard carries no transition at all.
	 */
	export const recordCard = [
		'rounded-2xl bg-card ring-1 ring-foreground/5 shadow-raised',
		'motion-safe:transition-[transform,box-shadow] motion-safe:duration-quick motion-safe:ease-move',
		'motion-safe:hover:-translate-y-[3px] hover:shadow-overlay'
	].join(' ');

	/**
	 * One entry of a record card's actions, in the order the record's own surfaces offer them.
	 *
	 * `onSelect` is the menus' own selection event, which is what lets a single list drive both of
	 * a card's routes without either holding a vocabulary of its own.
	 *
	 * The optional fields are what a row needed and a card never had a reason to ask for, and
	 * they are on the shared type rather than beside it so that a card and a row offering the same
	 * act describe it the same way. `disabled` is the act already running, which is the state a
	 * menu cannot show by hiding the entry: an act that vanishes mid-press reads as an act that
	 * was never there. `attributes` is what the surface marks the entry with, the `data-*` every
	 * list here is read by, and it is the caller's because the act it stands for is.
	 *
	 * `shortcut` and `group` arrived with the record acts of effort 832: an act declared once is
	 * projected onto the card, the record's page and the command menu, so the card draws the keys
	 * the act answers to, and a line between two acts that belong to different groups.
	 *
	 * `unavailable` arrived with the guidance of the same effort (requirement 16): an act that
	 * cannot run for this record is shown, refused, and says why in a tooltip, instead of being
	 * dropped or explained in a paragraph elsewhere on the surface.
	 */
	export type RecordCardAction = {
		label: string;
		icon: IconComponent;
		/**
		 * whether pressing it destroys something the reader cannot get back. The two tones
		 * `record-action-control` speaks, so an act reads the same on a card as on its page.
		 */
		tone?: RecordActionTone;
		/** the keys that also run it, printed beside it on both routes. */
		shortcut?: ShortcutCombination;
		/**
		 * which group of acts it belongs to. A separator is drawn wherever the group changes from
		 * one entry to the next, so the caller orders the entries and the card only draws the seams.
		 */
		group?: string;
		/** whether the act is already running, and so not pressable again for now. */
		disabled?: boolean;
		/**
		 * why the act cannot run for this record, in one line, or nothing where it can. The entry
		 * is drawn dimmed and refuses to run, and stays reachable by the pointer and the keyboard
		 * so that hovering or focusing it opens the reason beside it.
		 */
		unavailable?: string;
		/** what the surface marks this entry with, on whichever route draws it. */
		attributes?: Record<string, string>;
		onSelect: () => void;
	};

	/**
	 * What an unavailable entry is marked with, over the menu's own attributes, so assistive
	 * technology hears it refused. Written after the menu's attributes, because the menu marks
	 * every entry it was not told to disable as enabled.
	 */
	const unavailableEntry = {
		'aria-disabled': 'true',
		'data-unavailable': ''
	} as const;

	/**
	 * The tooltip trigger's attributes, less the two that would say the entry is something else: its
	 * slot, which names what the entry is to every surface and test that reads it, and the button
	 * type a trigger carries, which a menu entry is not.
	 */
	const asEntry = (props: Record<string, unknown>) => {
		const hint = { ...props };

		delete hint['data-slot'];
		delete hint.type;

		return hint;
	};

	/** how an unavailable entry looks: dimmed, as a disabled one is, and not pressable to the eye. */
	const unavailableLook = 'opacity-50 cursor-not-allowed';

	/** whether this entry opens a new group, and so has a separator drawn above it. */
	const opensGroup = (actions: RecordCardAction[], index: number) =>
		index > 0 && actions[index].group !== actions[index - 1].group;
</script>

<script lang="ts">
	// `href` is a route the concept already resolved, so the base is on it once — resolving it here
	// would put it on twice.
	import { Button } from '#lib/primitive/button/index.js';
	import * as ContextMenu from '#lib/primitive/context-menu/index.js';
	import * as DropdownMenu from '#lib/primitive/dropdown-menu/index.js';
	import { Kbd } from '#lib/primitive/kbd/index.js';
	import * as Tooltip from '#lib/primitive/tooltip/index.js';
	import { toShortcutHint, usesAppleKeyboard } from '#lib/shortcut.js';
	import { useDesignContract } from '#lib/strings.js';
	import { cn } from '#lib/tailwind.js';
	import type { Snippet } from 'svelte';

	const contract = useDesignContract();

	// which keyboard this is does not change while the window is open, so it is read once rather
	// than once per entry.
	const isAppleKeyboard = usesAppleKeyboard();

	// the reason stands beside the entry, on the side the menu reads towards.
	const reasonSide = $derived(contract.direction === 'rtl' ? 'left' : 'right');

	/**
	 * An unavailable entry is refused here rather than by the menu: a menu's own disabled entry is
	 * skipped by the keyboard and ignores the pointer, which would leave its reason unreachable.
	 * Preventing the selection also keeps the menu open, with the reason still showing.
	 */
	const refuse = (event: Event) => event.preventDefault();

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
		/** where the card opens, already resolved. */
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
	<span class="min-w-0 flex-1 truncate">{toTitleCase(action.label)}</span>
	{#if action.shortcut}
		<!-- a key name is not prose: it is what is printed on the keyboard, and the keyboard does
		     not change with the locale. -->
		<Kbd dir="ltr" class="shrink-0">{toShortcutHint(action.shortcut, isAppleKeyboard)}</Kbd>
	{/if}
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
			class="absolute inset-0 rounded-inherit focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
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
								<span class="sr-only">{contract.strings.openMenu}</span>
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
														{@render entry(action)}
													</div>
												{/snippet}
											</DropdownMenu.Item>
										{/snippet}
									</Tooltip.Trigger>
									<Tooltip.Content side={reasonSide} sideOffset={8}>
										{action.unavailable}
									</Tooltip.Content>
								</Tooltip.Root>
							{:else}
								<DropdownMenu.Item
									variant={action.tone === 'error' ? 'destructive' : 'default'}
									disabled={action.disabled}
									onSelect={action.onSelect}
									{...action.attributes}
								>
									{@render entry(action)}
								</DropdownMenu.Item>
							{/if}
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
			{#each actions as action, index (action.label)}
				{#if opensGroup(actions, index)}
					<ContextMenu.Separator />
				{/if}
				{#if action.unavailable}
					<Tooltip.Root>
						<Tooltip.Trigger>
							{#snippet child({ props: hint })}
								<ContextMenu.Item
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
											{@render entry(action)}
										</div>
									{/snippet}
								</ContextMenu.Item>
							{/snippet}
						</Tooltip.Trigger>
						<Tooltip.Content side={reasonSide} sideOffset={8}>
							{action.unavailable}
						</Tooltip.Content>
					</Tooltip.Root>
				{:else}
					<ContextMenu.Item
						variant={action.tone === 'error' ? 'destructive' : 'default'}
						disabled={action.disabled}
						onSelect={action.onSelect}
						{...action.attributes}
					>
						{@render entry(action)}
					</ContextMenu.Item>
				{/if}
			{/each}
		</ContextMenu.Content>
	</ContextMenu.Root>
{:else}
	<!-- a card with nothing to offer claims neither route: taking the gesture and answering it
	     with an empty menu would also suppress the one the webview would otherwise show. -->
	{@render card({})}
{/if}
