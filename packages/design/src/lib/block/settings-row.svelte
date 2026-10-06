<script lang="ts" module>
	import type { RecordCardAction } from '#lib/block/record-card.svelte';
	import type { Tone } from '#lib/tone.js';
	import { SvelteMap } from 'svelte/reactivity';

	/**
	 * The two tones a settings row is drawn in: an ordinary row, and the act at the end of a group
	 * that deletes, disconnects, forgets or signs somebody out. A row reports no other kind of
	 * event, so it takes no other tone ([[rules/interface]], *Tone*: nothing gains a tone it has no
	 * caller for).
	 */
	export type SettingsRowTone = Extract<Tone, 'neutral' | 'error'>;

	/**
	 * Which rows' detail a reader opened, for as long as the application runs: a row opened and
	 * left is found open when the reader comes back to its section, and nothing is written down
	 * past that. Keyed by the row's `detailsKey`.
	 */
	const opened = new SvelteMap<string, boolean>();

	/**
	 * One secondary act on a row, described as a record card describes it, so the same act reads
	 * the same in either. A row's menu draws no keys and no groups: it holds an act or two on one
	 * row of a growing list.
	 */
	export type SettingsRowAct = Pick<
		RecordCardAction,
		'label' | 'icon' | 'tone' | 'disabled' | 'unavailable' | 'attributes' | 'onSelect'
	>;

	/** The row's menu: what it is named, what it holds, and what the caller marks its control with. */
	export type SettingsRowMenu = {
		/** the control's accessible name, naming what it acts on: *actions for Olivia's Laptop*. */
		label: string;
		/** the row's secondary acts, in order. A row with none draws no control. */
		acts: SettingsRowAct[];
		/** the `data-*` the caller marks the control with, which a section is read by. */
		attributes?: Record<string, string>;
	};
</script>

<script lang="ts">
	import { Badge } from '#lib/primitive/badge/index.js';
	import { Button } from '#lib/primitive/button/index.js';
	import * as Collapsible from '#lib/primitive/collapsible/index.js';
	import * as Item from '#lib/primitive/item/index.js';
	import RecordMenu from '#lib/record-menu.svelte';
	import { tone as toneOf } from '#lib/tone.js';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import type { Component, Snippet } from 'svelte';

	/**
	 * One row of a settings card: a leading glyph, a name with its meta line under it and a badge
	 * beside it where one marks it, the value where there is one, and the control that changes it,
	 * in the manner of a platform settings pane.
	 *
	 * **The control is handed the id of the row's name**, so a control with no words of its own (a
	 * segmented choice, a switch) is labelled by the name beside it rather than by a second copy of
	 * it: the caller sets `aria-labelledby={labelId}` and a screen reader reads the row's name. A
	 * button that says what it does keeps its own words and may ignore it.
	 *
	 * **The meta line sits under the name, never in a column at the end** (effort 846, *Everything
	 * in a tab is a card*): when a machine was last seen, where a folder is, when Turso was last
	 * reached. Every product the research read puts it there, and it keeps the end of the row for
	 * the value and the control.
	 *
	 * **An error row is the act that ends something**, which a group draws last, after its
	 * separator. Only its button takes the destructive colour: the glyph and the name stay as
	 * neutral as any row's, so the colour marks the one thing that acts (effort 846, at the human's
	 * word of 2026-10-02: "only the action button shoud be in red"). The button is the caller's, a
	 * destructive ghost button, and its emphasis is shadcn's vocabulary, which *Tone* leaves to the
	 * control, rather than this block's. *The glyph and the name took the colour too until ticket 31
	 * of effort 846.*
	 *
	 * **What the row's state calls for is drawn beneath it, inside the row**, where a row has
	 * something to add to its value: a line saying what is under way, or a callout and the act it
	 * offers. It belongs to the row it explains, so it is not a row of its own for a screen reader
	 * to count, and it is not the group's footer, which speaks for every row. It is never folded.
	 *
	 * **Detail few readers need folds under the row** (`details`), in the manner of Fluent's
	 * settings expander: the glyph, the name, the value and the control stay in view, and a chevron
	 * after them opens the detail beneath, one level only, closed by default and remembered while
	 * the application runs. The chevron is a button labelled by `detailsLabel`, so it says what it
	 * opens, and the `collapsible` primitive gives it `aria-expanded` and `aria-controls` and opens
	 * it from Enter and Space. The detail is drawn only while open, so nobody meets words they did
	 * not ask for. **An error row takes none**: the act that ends something is read whole, and
	 * nothing about it is put away.
	 *
	 * **A row's secondary acts are its menu** (`menu`), on one row of a list that grows, such as a
	 * machine signed in as the reader: the record menu a record card draws, its quiet control at
	 * the row's end named by the caller for what it acts on, and its entries, an act that cannot run
	 * shown refused with its reason beside it. It is the row's own, so a section hands it the acts
	 * and never draws the menu or the tooltip itself ([[contexts/desktop/components]], *A block
	 * before a primitive*). An act that ends something drawn this way takes the menu's default
	 * tone, so the card's end keeps its one error-tone act ([[rules/interface]], *A card has one
	 * anatomy*).
	 *
	 * **A row may report a state** (`reports`): its glyph and its name then take that state's tone,
	 * as the sync state's five do, the one row in the area whose words carry a tone at all.
	 *
	 * The words are the caller's, as every block in this package takes them, and are drawn as
	 * written but for the name's first letter, which is raised as a label's is, unless the name is
	 * somebody's own word (`nameAsWritten`): a username is drawn exactly as its member wrote it, and
	 * isolated, so a name in another script keeps its direction, as the group's title is.
	 */
	let {
		icon: Icon,
		name,
		nameAsWritten = false,
		meta,
		badge,
		value,
		control,
		menu,
		beneath,
		details,
		detailsLabel,
		detailsKey,
		tone = 'neutral',
		reports,
		...marks
	}: {
		/** The glyph that leads the row: what it is about. */
		icon: Component<{ class?: string }>;
		/** What the row is, in the reader's language. Also the control's label. */
		name: string;
		/**
		 * Whether the name is somebody's own word, a username, drawn exactly as written: a label's
		 * first letter is raised, and a name's is not the row's to change.
		 */
		nameAsWritten?: boolean;
		/** One muted line under the name: when it was seen, where it is, how it stands. */
		meta?: string | Snippet;
		/** A short word beside the name that marks this row among its neighbours. */
		badge?: string;
		/** What it is set to now, as words or as a picture, where it has a value to show. */
		value?: string | Snippet;
		/** The control that changes it, given the id of the row's name to be labelled by. */
		control?: Snippet<[{ labelId: string }]>;
		/** The row's secondary acts, behind a quiet control at its end, after the control. */
		menu?: SettingsRowMenu;
		/** What the row's state calls for, drawn beneath it inside the row, where there is any. */
		beneath?: Snippet;
		/** Detail few readers need, folded under the row behind a chevron. Not on an error row. */
		details?: Snippet;
		/** What the chevron opens, as its label: *what's new*, *the full path*. */
		detailsLabel?: string;
		/** What the opened state is remembered under; the row's name where none is given. */
		detailsKey?: string;
		/**
		 * Whether this row ends something. Marked on the row, so a test can find it; the colour is
		 * on the caller's button alone.
		 */
		tone?: SettingsRowTone;
		/**
		 * The tone of the state the row reports, drawn on its glyph and its name: the sync state's
		 * five. A row that names a state in words and colour is read at a glance; it is never the
		 * mark of an act that ends something, which `tone` is.
		 */
		reports?: Tone;
		/** The caller's marks for the row, `data-*` attributes a section is read by. */
		[mark: `data-${string}`]: unknown;
	} = $props();

	const labelId = $props.id();

	// a row reporting a state draws its glyph and name in that state's tone; every other row, the
	// one that ends something included, mutes its glyph beside its name, so the name reads first and
	// an ending row's colour is its button's alone.
	const coloured = $derived(reports ? toneOf({ tone: reports }).text() : null);
	const glyph = $derived(coloured ?? 'text-muted-foreground');
	const words = $derived(coloured ?? undefined);

	// a menu with nothing in it is not drawn: a control that opens onto nothing is no control.
	const offers = $derived((menu?.acts.length ?? 0) > 0);

	// an error row is read whole: whatever detail it was handed, it folds nothing away.
	const folds = $derived(details !== undefined && tone !== 'error');
	const key = $derived(detailsKey ?? name);

	// closed until the reader opens it, and found as they left it when they come back.
	const open = $derived(opened.get(key) ?? false);
</script>

{#snippet face()}
	<Item.Media variant="icon" class={glyph}>
		<Icon class="size-4" />
	</Item.Media>

	<Item.Content class="min-w-0">
		<!-- the title is a flex row, and a first letter is only raised in a block: the name sits in
		     one of its own, with the badge that marks the row beside it. -->
		<Item.Title id={labelId} class="{words ?? ''} max-w-full flex-wrap">
			{#if nameAsWritten}
				<span class="inline-block min-w-0"><bdi>{name}</bdi></span>
			{:else}
				<span class="inline-block min-w-0 first-letter:uppercase">{name}</span>
			{/if}
			{#if badge}
				<Badge variant="secondary" data-row-badge><bdi>{badge}</bdi></Badge>
			{/if}
		</Item.Title>
		{#if meta !== undefined}
			<Item.Description data-row-meta>
				{#if typeof meta === 'string'}
					{meta}
				{:else}
					{@render meta()}
				{/if}
			</Item.Description>
		{/if}
	</Item.Content>

	{#if value !== undefined}
		<div data-row-value class="min-w-0 text-sm text-muted-foreground">
			{#if typeof value === 'string'}
				{value}
			{:else}
				{@render value()}
			{/if}
		</div>
	{/if}

	{#if control || offers}
		<Item.Actions>
			{@render control?.({ labelId })}
			{#if menu && offers}
				<RecordMenu actions={menu.acts} label={menu.label} attributes={menu.attributes} />
			{/if}
		</Item.Actions>
	{/if}
{/snippet}

{#snippet under()}
	{#if beneath}
		<Item.Footer class="flex-col items-stretch" data-row-beneath>
			{@render beneath()}
		</Item.Footer>
	{/if}
{/snippet}

{#if folds && details}
	<Collapsible.Root bind:open={() => open, (next) => opened.set(key, next)}>
		{#snippet child({ props })}
			<Item.Root
				{...marks}
				{...props}
				role="listitem"
				size="sm"
				data-settings-row
				data-row-tone={tone}
				data-row-details
			>
				{@render face()}

				<Collapsible.Trigger>
					{#snippet child({ props: trigger })}
						<!-- after the control, where the row ends: it opens what is under the row, and
						     never stands between the name and what changes it. -->
						<Button
							{...trigger}
							variant="ghost"
							size="icon-sm"
							class="shrink-0 text-muted-foreground [&>svg]:transition-transform [&>svg]:duration-quick [&[data-state=open]>svg]:rotate-180"
							aria-label={detailsLabel ?? name}
							data-row-details-trigger
						>
							<ChevronDownIcon class="size-4" />
						</Button>
					{/snippet}
				</Collapsible.Trigger>

				{@render under()}

				<Collapsible.Content
					class="basis-full ps-6.5 data-[state=open]:animate-in data-[state=open]:fade-in-0"
					data-row-details-content
				>
					{#if open}
						<div class="flex flex-col gap-1 pb-1 text-sm text-muted-foreground">
							{@render details()}
						</div>
					{/if}
				</Collapsible.Content>
			</Item.Root>
		{/snippet}
	</Collapsible.Root>
{:else}
	<Item.Root {...marks} role="listitem" size="sm" data-settings-row data-row-tone={tone}>
		{@render face()}
		{@render under()}
	</Item.Root>
{/if}
