<script lang="ts">
	import * as Field from '@rentable/design/primitive/field/index.js';
	import type { Snippet } from 'svelte';

	/**
	 * The bar a settings directory opens with: what the section is, and what it offers.
	 *
	 * **The contracts view's shape, on a section that has no list shell** (effort 828,
	 * requirements 19 and 21). `design/block/list.svelte` draws a card-coloured bar above its
	 * records with the reading controls at one end, and the human asked for the same here after
	 * seeing the members directory with its primary at the foot. What the settings sections do not
	 * take from that shell is everything else it owns: a search, a sort, a count, an export and
	 * virtualization over a query, none of which a directory of a dozen accounts wants.
	 *
	 * **Two sections draw it**, members and workspaces, so it takes what differs as props and
	 * nothing else: the legend, the sentence under it, and whatever stands at the end of the bar.
	 * That is one concept's two surfaces rather than two concepts, which is what keeps it here
	 * beside them rather than in the design package ([[rules/frontend]], *Components*).
	 *
	 * **The legend is named from here and the fieldset points at it.** A rendered `legend` is
	 * taken out of its fieldset's own layout and cannot stand on a line with anything, so it sits
	 * inside the bar and the `Field.Set` around the directory carries `aria-labelledby`.
	 *
	 * **The end of the bar is the caller's snippet, and a section with nothing to put there passes
	 * none.** The members section puts its add behind `inviteMember`; the workspaces section puts
	 * a create or the sentence that stands in its place. An empty container would leave the legend
	 * pushed to one side of a bar with nothing at the other.
	 */
	let {
		legendId,
		legend,
		description,
		action
	}: {
		/** what the fieldset around the directory names in `aria-labelledby`. */
		legendId: string;
		/** the section's name, as the rail calls it. */
		legend: string;
		/** one sentence saying what the section is for. */
		description: string;
		/** what stands at the end of the bar, where the section has anything to put there. */
		action?: Snippet;
	} = $props();
</script>

<div
	data-directory-tray
	class="flex flex-col gap-3 rounded-2xl bg-card px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
>
	<div class="min-w-0">
		<Field.Legend id={legendId}>{legend}</Field.Legend>
		<Field.Description data-directory-description>{description}</Field.Description>
	</div>

	{#if action}
		<div class="flex shrink-0 flex-wrap items-center gap-3">
			{@render action()}
		</div>
	{/if}
</div>
