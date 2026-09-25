<script lang="ts">
	/**
	 * The list block with its search bound, and the search it last committed written out.
	 *
	 * Scaffolding rather than a test, and a fixture rather than a `wrapper` because the block takes
	 * a snippet and needs two providers. The committed search is drawn in an `output` so a test
	 * reads what a directory's query would have been handed, and when.
	 */
	import List from '$lib/design/block/list.svelte';
	import * as Tooltip from '@rentable/design/primitive/tooltip/index.js';
	import { DesignProvider } from '@rentable/design/strings.js';
	import { placeholderStrings as strings } from './strings';

	let search = $state('');
</script>

<DesignProvider {strings} direction="ltr">
	<Tooltip.Provider>
		<List data={[{ id: 'one' }]} bind:search emptyTitle="nothing here yet">
			{#snippet record(row)}
				<span>{row.id}</span>
			{/snippet}
		</List>
		<output data-committed-search>{search}</output>
	</Tooltip.Provider>
</DesignProvider>
