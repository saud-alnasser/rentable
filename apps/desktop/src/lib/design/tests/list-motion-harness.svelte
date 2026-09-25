<script lang="ts">
	/**
	 * The list block with its result set handed in from outside, the way a directory's query hands
	 * it one.
	 *
	 * Scaffolding rather than a test, and a fixture rather than a `wrapper` because the block takes
	 * a snippet and needs two providers. `data` is this fixture's own prop, so a test changes the
	 * result set with `rerender` exactly as a refetch would change it, and the block's search is
	 * bound here as a directory binds it.
	 */
	import List from '$lib/design/block/list.svelte';
	import * as Tooltip from '@rentable/design/primitive/tooltip/index.js';
	import { DesignProvider } from '@rentable/design/strings.js';
	import { placeholderStrings as strings } from './strings';

	let { data }: { data: { id: string }[] } = $props();

	let search = $state('');
</script>

<DesignProvider {strings} direction="ltr">
	<Tooltip.Provider>
		<List {data} bind:search emptyTitle="nothing here yet">
			{#snippet record(row)}
				<span>{row.id}</span>
			{/snippet}
		</List>
	</Tooltip.Provider>
</DesignProvider>
