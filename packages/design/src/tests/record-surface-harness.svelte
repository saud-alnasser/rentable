<script lang="ts">
	/**
	 * A record surface, found, holding three collections.
	 *
	 * Scaffolding rather than a test. A collection's content is a snippet, and a snippet is the one
	 * kind of prop a `.ts` test cannot write, so the three are written here, each saying which
	 * collection it is. The section the address names is the one prop a test drives.
	 */
	import RecordSurface from '#lib/block/record-surface.svelte';

	let { section }: { section?: string | null } = $props();
</script>

{#snippet payments()}
	<p>the payments</p>
{/snippet}

{#snippet units()}
	<p>the units</p>
{/snippet}

{#snippet history()}
	<p>the history</p>
{/snippet}

<RecordSurface
	found
	backFallback="/contracts"
	path="/contracts/1"
	eyebrow="contract"
	title="a name"
	{section}
	collections={[
		{ value: 'payments', label: 'payments', content: payments },
		{ value: 'units', label: 'units', content: units },
		{ value: 'history', label: 'history', content: history }
	]}
/>
