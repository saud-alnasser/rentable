<script lang="ts">
	import * as Field from '@rentable/design/primitive/field/index.js';
	import type { ListSort } from '@rentable/design/sort.js';
	import ListToolbar, { type ListSortOption } from '$lib/design/block/list-toolbar.svelte';
	import type { Snippet } from 'svelte';

	/**
	 * What a settings directory opens with: what the section is, and the list shell's own bar.
	 *
	 * **The list shell's toolbar, on a section that has no list shell** (effort 828, requirements
	 * 19 and 21; effort 832, requirement 7). The bar is `design/block/list-toolbar.svelte`, the
	 * one the list shell draws above its records, so a directory is searched with the same field,
	 * the same wait and the same `/`, and ordered with the same control, as every other set
	 * ([[rules/interface]], *Search*). What the settings sections still do not take from the shell
	 * is the rest of it: an export and virtualization over a query, neither of which a directory of
	 * a dozen accounts wants. *The bar held the section's name and sentence, with its primary at the
	 * other end, until effort 832 gave it the search; the name and sentence now head the section
	 * above the bar, which is where a record page's title sits over its own.*
	 *
	 * **Three directories draw it**, members, roles and workspaces, so it takes what differs as props
	 * and nothing else: the legend, the sentence under it, the search and order the section holds,
	 * and whatever stands at the end of the bar. That is one concept's surfaces rather than three
	 * concepts, which is what keeps it here beside them rather than in the design package
	 * ([[rules/frontend]], *Components*). *It was two, members and workspaces, until ticket 19 of
	 * effort 838 gave the roles block the bar.*
	 *
	 * **The legend is named from here and the fieldset points at it.** A rendered `legend` is
	 * taken out of its fieldset's own layout and cannot stand on a line with anything, so it is
	 * drawn here and the `Field.Set` around the directory carries `aria-labelledby`.
	 *
	 * **The bar's order is the list shell's**: the field, the count, what narrows or reads the set
	 * (`narrowing`), the order, and what acts on it (`action`), with the create last.
	 *
	 * **The end of the bar is the caller's snippet, and a section with nothing to put there passes
	 * none.** The members section puts its add behind `inviteMember`; the workspaces section puts
	 * a create or the sentence that stands in its place, after the count and the order as the list
	 * shell puts its own. A create is the one create control, last in the bar, where the list
	 * shell's toolbar puts it too ([[rules/interface]], *Create*).
	 */
	let {
		legendId,
		legend,
		description,
		search = $bindable(''),
		answersSearchKey = true,
		count,
		sortOptions,
		sort = $bindable(null),
		narrowing,
		action
	}: {
		/** what the fieldset around the directory names in `aria-labelledby`. */
		legendId: string;
		/** the section's name, as the rail calls it. */
		legend: string;
		/** one sentence saying what the section is for. */
		description: string;
		/** the search the directory narrows its cards by, already debounced by the field. */
		search?: string;
		/** whether the field answers `/`, which a section drawing two directories gives one of them. */
		answersSearchKey?: boolean;
		/** how many cards the directory is showing. */
		count: number;
		/** the orders the directory offers. */
		sortOptions: readonly ListSortOption[];
		/** the order the directory is using, or `null` for the order it arrived in. */
		sort?: ListSort | null;
		/**
		 * what stands between the count and the order, where the list shell puts its filter and its
		 * selecting: a control about what the reader is looking at rather than one that acts on it.
		 */
		narrowing?: Snippet;
		/** what stands at the end of the bar, where the section has anything to put there. */
		action?: Snippet;
	} = $props();
</script>

<div data-directory-tray class="flex flex-col gap-3">
	<div class="min-w-0">
		<Field.Legend id={legendId}>{legend}</Field.Legend>
		<Field.Description data-directory-description>{description}</Field.Description>
	</div>

	<ListToolbar bind:search {answersSearchKey} {count} {sortOptions} bind:sort {narrowing}>
		{@render action?.()}
	</ListToolbar>
</div>
