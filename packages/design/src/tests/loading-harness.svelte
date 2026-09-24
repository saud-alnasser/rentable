<script lang="ts">
	/**
	 * The loading block with a skeleton and content a test can find.
	 *
	 * Scaffolding rather than a test. The subject takes two snippets, and a snippet is the one kind
	 * of prop a `.ts` test cannot write; `loading` passes through, so `rerender` drives the load.
	 */
	import Loading from '#lib/block/loading.svelte';

	let { loading, label }: { loading: boolean; label?: string } = $props();
</script>

<Loading {loading} {label}>
	{#snippet skeleton()}
		<div data-testid="skeleton"></div>
	{/snippet}

	<p data-testid="content">the content</p>
</Loading>
