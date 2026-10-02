<script lang="ts">
	import * as Item from '#lib/primitive/item/index.js';
	import type { Snippet } from 'svelte';

	/**
	 * A group of settings rows, in the manner of a platform settings pane: a short title over a
	 * card of rows, and at most one line under it.
	 *
	 * **The explanation belongs to the group, not to every row.** A row says what it is and what it
	 * is set to; the one sentence a group needs sits under it, so a section reads as names and
	 * values rather than as a column of paragraphs.
	 *
	 * **The rows that end something are drawn last, after a separator**, so a reader always finds
	 * the act that deletes, disconnects, forgets or signs somebody out at the end of its group and
	 * never between two benign ones. They are a slot of their own rather than a row the caller
	 * remembers to put last, so the order is this block's to keep.
	 *
	 * The rows are a list, and each `settings-row` is one of its items, so a screen reader announces
	 * how many a group holds. The words are the caller's.
	 */
	let {
		title,
		footer,
		rows,
		end
	}: {
		/** What the group is about, where the section's own name does not already say it. */
		title?: string;
		/** One line under the group: what the reader should know about all of its rows. */
		footer?: string;
		/** The group's rows, each a `settings-row`. */
		rows: Snippet;
		/** The rows that end something, each a `settings-row` in the error tone: always last. */
		end?: Snippet;
	} = $props();

	const titleId = $props.id();
</script>

<section
	data-settings-group
	aria-labelledby={title ? titleId : undefined}
	class="flex flex-col gap-2"
>
	{#if title}
		<h2 id={titleId} class="px-3 text-sm font-medium text-muted-foreground first-letter:uppercase">
			{title}
		</h2>
	{/if}

	<Item.Group class="gap-0 rounded-2xl border bg-card has-data-[size=sm]:gap-0">
		{@render rows()}

		{#if end}
			<!-- decorative, so the list holds rows and nothing else for a screen reader to count. -->
			<Item.Separator decorative class="my-0" />
			{@render end()}
		{/if}
	</Item.Group>

	{#if footer}
		<p class="px-3 text-sm text-muted-foreground">{footer}</p>
	{/if}
</section>
