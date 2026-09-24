<script lang="ts">
	/**
	 * A record card with the content a concept puts in the middle of one.
	 *
	 * Scaffolding rather than a test. The subject's `content` is a snippet, which is the one kind
	 * of prop a `.ts` test cannot write; everything else it takes is a value, so it is a prop here
	 * and the test drives it. The tooltip's provider is above it, as the application's sidebar
	 * provider is, because an unavailable act says why in a tooltip.
	 */
	import RecordCard, { type RecordCardAction } from '#lib/block/record-card.svelte';
	import * as Tooltip from '#lib/primitive/tooltip/index.js';

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

<Tooltip.Provider delayDuration={0}>
	<RecordCard {href} {label} {actions}>
		{#snippet content()}
			<span class="pointer-events-none relative">اسم السجل</span>
		{/snippet}
	</RecordCard>
</Tooltip.Provider>
