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
	 * It carries resting elevation, which is the answer a prototype gave against the real lists: a
	 * small shadow is not a per-row claim about importance, it is what makes a row read as an
	 * object at all, and a hover that has already been told these are objects is free to say only
	 * *this one* (_Use shadows to convey elevation_, 180). The ring is not decoration and not the book's: it is silent on dark mode,
	 * where a shadow against a dark ground reads as almost nothing, and the ring is what separates
	 * the card there.
	 *
	 * *It was declared by the list block until #782, and the edge ran the wrong way: a card that
	 * carries no domain imported it from the one component that does. It sits on the component
	 * that wears it now, and the list reads it from here.*
	 *
	 * **It says *this one* with a tint, and never by moving.** A card under the pointer, or reached
	 * from the keyboard, takes the muted fill a list row takes on every platform, and a press deepens
	 * it; nothing shifts, so the text a reader is aiming at stays where it was. *It lifted by three
	 * pixels and deepened its shadow until 2026-09-25, when the human found the movement threw the
	 * row off under the pointer (effort 835); the tint is the plain highlight Apple's lists use.*
	 */
	export const recordCard = [
		'rounded-2xl bg-card ring-1 ring-foreground/5 shadow-raised',
		'transition-colors duration-quick',
		'hover:bg-muted/70 focus-visible:bg-muted/70 active:bg-muted'
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
</script>

<script lang="ts">
	// `href` is a route the concept already resolved, so the base is on it once — resolving it here
	// would put it on twice.
	import * as ContextMenu from '#lib/primitive/context-menu/index.js';
	import { Kbd } from '#lib/primitive/kbd/index.js';
	import * as Tooltip from '#lib/primitive/tooltip/index.js';
	import { toShortcutHint, usesAppleKeyboard } from '#lib/shortcut.js';
	import { useDesignContract } from '#lib/strings.js';
	import { cn } from '#lib/tailwind.js';
	import RecordMenu, {
		asEntry,
		opensGroup,
		refuse,
		unavailableEntry,
		unavailableLook
	} from '#lib/record-menu.svelte';
	import type { Snippet } from 'svelte';

	const contract = useDesignContract();

	// which keyboard this is does not change while the window is open, so it is read once rather
	// than once per entry.
	const isAppleKeyboard = usesAppleKeyboard();

	// the reason stands beside the entry, on the side the menu reads towards, as it does on the
	// control's route.
	const reasonSide = $derived(contract.direction === 'rtl' ? 'left' : 'right');

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
	 *
	 * **Two layouts.** A `row` is one line, the content then the control, and is what every list
	 * one record wide draws. A `tile` is a column, for a list laid as a grid: a heading line holding
	 * the `heading` snippet with the control at its end, then `content` as the facts below it, each
	 * child a line of its own. The link over the card and both routes are the same in each.
	 */
	let {
		href,
		label,
		actions,
		content,
		heading,
		layout = 'row',
		class: className
	}: {
		/** where the card opens, already resolved. */
		href: string;
		/** what the link is called, since it carries no text of its own. */
		label: string;
		/** what the record offers. A card with none shows neither route. */
		actions: RecordCardAction[];
		/** the card's own content, as flex children: a row's middle, or a tile's facts. */
		content: Snippet;
		/**
		 * what a tile is read by, drawn on its first line before the control: the record's name and
		 * its status, as the concept draws them. A row has no heading line and ignores it.
		 */
		heading?: Snippet;
		/** a row, one line, or a tile, a heading line over the facts. A row unless a grid asks. */
		layout?: 'row' | 'tile';
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

{#snippet control()}
	{#if actions.length > 0}
		<!-- the record menu, drawn from the package's one home for it, which a settings row's menu
		     reads too: the quiet control, named by the contract's word, and the same entries the
		     context gesture offers. -->
		<div class="relative flex size-8 shrink-0 items-center justify-center">
			<RecordMenu {actions} label={contract.strings.openMenu} {entry} />
		</div>
	{/if}
{/snippet}

{#snippet card(triggerProps: Record<string, unknown>)}
	<div
		{...triggerProps}
		data-layout={layout === 'tile' ? 'tile' : undefined}
		class={cn(
			layout === 'tile'
				? 'relative flex h-full flex-col gap-2 p-4 hover:bg-muted/40'
				: 'relative flex h-full items-center gap-3 px-4 hover:bg-muted/40',
			recordCard,
			className
		)}
	>
		<a
			{href}
			aria-label={label}
			class="absolute inset-0 rounded-inherit focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
		></a>

		{#if layout === 'tile'}
			<!-- the heading line: what the tile is, then what can be done to it, at the end where a
			     row puts the control too. Its own height is the control's, so a tile with no actions
			     keeps its heading where a tile with them has it. -->
			<div class="flex min-h-8 items-center gap-3">
				<div class="pointer-events-none relative flex min-w-0 flex-1 items-center gap-2">
					{@render heading?.()}
				</div>
				{@render control()}
			</div>

			{@render content()}
		{:else}
			{@render content()}

			{@render control()}
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
							<!-- drawn as the control's route draws it, so the two routes say it alike. -->
							<span class="block max-w-xs" data-unavailable-reason>{action.unavailable}</span>
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
