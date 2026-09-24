<script lang="ts">
	import BackControl from '#lib/block/back-control.svelte';
	import Empty from '#lib/block/empty.svelte';
	import { useDesignContract } from '#lib/strings.js';

	/**
	 * What a surface says when the thing it was asked for is not there: a record that does not
	 * exist, or an address that leads to no page.
	 *
	 * **One treatment, and one way back.** The two used to differ: a missing record drew the back
	 * control in its corner and a labelled way back under its sentence, two controls going to one
	 * place, and an unknown address drew the application's failure card with a primary button to the
	 * dashboard. Both are the same situation to the reader, so both say it in the empty block's
	 * not-found shape and offer the one back control, labelled, beneath the sentence
	 * ([[rules/interface]], *Empty* and *Going back*).
	 *
	 * **Back goes where back goes**: to the screen the reader came from, or to `fallback` where they
	 * came from nowhere. A record falls back to its concept's directory; an unknown address to the
	 * dashboard.
	 *
	 * The words are the caller's, as the empty block's are: a record and a page are named
	 * differently, and this package reads its own chrome's words only, which the way back is.
	 */
	let {
		title,
		description,
		fallback,
		class: className
	}: {
		/** that the record or the page does not exist. */
		title: string;
		/** one line saying how it comes to be gone. */
		description?: string;
		/** where back goes when there is nowhere to return to, already resolved. */
		fallback: string;
		/** classes for the region, so it fills the space the content would have. */
		class?: string;
	} = $props();

	const contract = useDesignContract();
</script>

<Empty kind="not-found" {title} {description} class={className}>
	{#snippet action()}
		<BackControl {fallback} label={contract.strings.goBack} labelled />
	{/snippet}
</Empty>
