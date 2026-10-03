<script lang="ts">
	import * as Item from '#lib/primitive/item/index.js';
	import { cn } from '#lib/tailwind.js';
	import type { Component, Snippet } from 'svelte';

	/**
	 * A settings card: everything a settings section shows is one of these, one under the next in
	 * a `settings-grid` (effort 846, *Everything in a tab is a card*, at the human's word of
	 * 2026-10-02: "each section ... everything is a card").
	 *
	 * **One anatomy for every card in every tab.** A header inside the card: the card's glyph, its
	 * title, one muted line saying what the card is for, and at its end an optional value (a count,
	 * a state, a picture) and an optional act (`action`). Then the rows, each a `settings-row`,
	 * hairlines between them. Then, after a separator, the rows that end something. Then an
	 * optional footer: one note, a progress bar, or one act. The title and the line sit inside the
	 * card rather than over and under it, so a card stands on its own in the column.
	 * *They sat above and below a card of rows until that word.*
	 *
	 * **A card's one act on the whole card sits at its header's trailing edge** (`action`), the end
	 * the value is drawn at, mirrored in Arabic: a quiet text button the caller draws, words with no
	 * glyph, since the header's glyph already says what the card is about. It is for the act that
	 * takes the card as a whole (change the password, sign every other machine out), so the card
	 * needs no row or footer that only holds a button. Where that act ends something its words are
	 * red and it asks first, as any ending act does; its button is the header's one red. *The header
	 * held a value and never an act until ticket 46 of effort 846, at the human's word of 2026-10-03:
	 * "a text simple milimst on the right side of the card".*
	 *
	 * **The explanation belongs to the card, not to every row.** A row says what it is and what it
	 * is set to; the one sentence a card needs is its header's line, so a section reads as names
	 * and values rather than as a column of paragraphs.
	 *
	 * **The rows that end something are drawn last, after a separator**, so a reader always finds
	 * the act that deletes, disconnects, forgets or signs somebody out at the end of its card and
	 * never between two benign ones. They are a slot of their own rather than a row the caller
	 * remembers to put last, so the order is this block's to keep. The error tone is on the act's
	 * button in those rows alone, never on the row's words, the card's edge or a band across it.
	 *
	 * **Every card takes the column's whole width**: the column is the one width there is, so a card
	 * says nothing about how wide it is. *A card was half a two-column grid unless it said
	 * `span="full"` until ticket 31 of effort 846.*
	 *
	 * **The card is the record card's surface** (`recordCard`'s radius, hairline ring and raised
	 * shadow) rather than a bordered box, so a settings tab and a list read as one application, and
	 * the shadow rather than a border marks its edge (*Use fewer borders*).
	 *
	 * The rows are a list, and each `settings-row` is one of its items, so a screen reader announces
	 * how many a card holds. The words are the caller's.
	 */
	let {
		icon: Icon,
		media,
		title,
		titleAsWritten = false,
		description,
		value,
		action,
		rows,
		end,
		footer
	}: {
		/** The glyph the card's header leads with: what it is about. */
		icon?: Component<{ class?: string }>;
		/** What leads the header in the glyph's place, where a picture says it better: an avatar. */
		media?: Snippet;
		/** What the card is about. */
		title?: string;
		/**
		 * Whether the title is somebody's own word, a username or a machine's name, drawn exactly
		 * as written: a label's first letter is raised, and a name's is not the card's to change.
		 */
		titleAsWritten?: boolean;
		/** One line under the title: what the card is for, said once for all of its rows. */
		description?: string;
		/** What the header says at its end: a count, a state, a picture. Never an act. */
		value?: string | Snippet;
		/**
		 * The card's one act on itself, at the header's trailing edge after the value: a quiet text
		 * button, red words where it ends something. The caller draws the button.
		 */
		action?: Snippet;
		/** The card's rows, each a `settings-row`. */
		rows?: Snippet;
		/** The rows that end something, each a `settings-row` marked `error`: always last. */
		end?: Snippet;
		/** What closes the card: one note, a progress bar, or one act. */
		footer?: string | Snippet;
	} = $props();

	const titleId = $props.id();

	const hasHeader = $derived(Boolean(title || description || Icon || media || value || action));
	const hasBody = $derived(Boolean(rows || end || footer !== undefined));
</script>

<section
	data-settings-group
	aria-labelledby={title ? titleId : undefined}
	class="flex min-w-0 flex-col rounded-2xl bg-card shadow-raised ring-1 ring-foreground/5"
>
	{#if hasHeader}
		<header
			data-settings-group-header
			class={cn('flex items-start gap-3 px-4 pt-4', hasBody ? 'pb-2' : 'pb-4')}
		>
			{#if media}
				<div class="shrink-0">{@render media()}</div>
			{:else if Icon}
				<!-- a tile rather than a bare glyph, so the header reads as the card's own and a row's
				     glyph under it reads as a row's. Muted, since a glyph is heavy beside its words
				     (*Balance weight and contrast*). -->
				<div
					class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
					data-settings-group-glyph
				>
					<Icon class="size-4" />
				</div>
			{/if}

			<div class="flex min-w-0 flex-1 flex-col gap-0.5">
				{#if title}
					<h2
						id={titleId}
						class={cn('text-sm font-semibold', !titleAsWritten && 'first-letter:uppercase')}
					>
						{#if titleAsWritten}<bdi>{title}</bdi>{:else}{title}{/if}
					</h2>
				{/if}
				{#if description}
					<p class="text-sm text-muted-foreground" data-settings-group-description>
						{description}
					</p>
				{/if}
			</div>

			{#if value !== undefined}
				<div class="shrink-0 text-sm text-muted-foreground" data-settings-group-value>
					{#if typeof value === 'string'}
						{value}
					{:else}
						{@render value()}
					{/if}
				</div>
			{/if}

			{#if action}
				<!-- pulled out by the ghost button's own inset, so its words end where the card's
				     other text does rather than a step short of the edge. -->
				<div class="-my-1 -me-3 shrink-0" data-settings-group-action>
					{@render action()}
				</div>
			{/if}
		</header>
	{/if}

	{#if rows || end}
		<!-- the rows sit inside the card's own inset, so the hairline between two of them stops
		     short of its edges, as a grouped list's does. -->
		<Item.Group
			class={cn(
				'gap-0 px-4 has-data-[size=sm]:gap-0',
				'[&>[data-settings-row]]:rounded-none [&>[data-settings-row]]:px-0',
				'[&>[data-settings-row]+[data-settings-row]]:border-t-border',
				!hasHeader && 'pt-2',
				!footer && 'pb-2'
			)}
		>
			{@render rows?.()}

			{#if end}
				{#if rows}
					<!-- decorative, so the list holds rows and nothing else for a screen reader to
					     count. -->
					<Item.Separator decorative class="my-0" />
				{/if}
				{@render end()}
			{/if}
		</Item.Group>
	{/if}

	{#if footer !== undefined}
		<footer
			data-settings-group-footer
			class={cn(
				'flex flex-col gap-2 px-4 pt-3 pb-4 text-sm text-muted-foreground',
				(rows || end) && 'border-t'
			)}
		>
			{#if typeof footer === 'string'}
				<p>{footer}</p>
			{:else}
				{@render footer()}
			{/if}
		</footer>
	{/if}
</section>
