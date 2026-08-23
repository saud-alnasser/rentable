<script lang="ts">
	/**
	 * A record card with the content a concept puts in the middle of one.
	 *
	 * Scaffolding rather than a test. The subject's `content` is a snippet, which is the one kind
	 * of prop a `.ts` test cannot write; everything else it takes is a value, so it is a prop here
	 * and the test drives it.
	 */
	import RecordCard, { type RecordCardAction } from '#lib/block/record-card.svelte';

	let {
		href = '/records/1',
		label = 'افتح السجل',
		actions = []
	}: {
		href?: string;
		label?: string;
		actions?: RecordCardAction[];
	} = $props();
</script>

<RecordCard {href} {label} {actions}>
	{#snippet content()}
		<span class="pointer-events-none relative">اسم السجل</span>
	{/snippet}
</RecordCard>
