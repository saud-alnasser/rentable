<script lang="ts">
	/**
	 * The list block with every toolbar menu it can draw, each in the state that gives it the most
	 * rows.
	 *
	 * Scaffolding rather than a test, and a fixture rather than a `wrapper` because the block takes
	 * a snippet: `record` is required, and a snippet cannot be written in a `.ts` file. It also
	 * needs two providers, the string contract and the tooltip's. The filter
	 * is already narrowed, so its menu carries the row that clears it as well as its values; the
	 * sort is already chosen, so its menu marks the chosen order; and both transfer directions are
	 * offered.
	 */
	import List from '$lib/design/block/list.svelte';
	import type { FilterSelection, ListFilter } from '$lib/design/filter';
	import type { ListSort } from '@rentable/design/sort.js';
	import * as Tooltip from '@rentable/design/primitive/tooltip/index.js';
	import { DesignProvider } from '@rentable/design/strings.js';
	import { placeholderStrings as strings } from './strings';

	const status: ListFilter = {
		kind: 'choice',
		id: 'status',
		label: () => 'status',
		options: [
			{ id: 'open', label: () => 'open' },
			{ id: 'closed', label: () => 'closed' }
		]
	};

	let filters = $state<FilterSelection>({ status: 'open' });
	let sort = $state<ListSort | null>({ columnId: 'name', direction: 'asc' });
	const noop = () => {};
</script>

<DesignProvider {strings} direction="ltr">
	<Tooltip.Provider>
		<List
			data={[{ id: 'one' }]}
			filterOptions={[status]}
			bind:filters
			sortOptions={[
				{ id: 'name', label: 'name' },
				{ id: 'created', label: 'created' }
			]}
			bind:sort
			exportAs={{ name: 'records', columns: [] }}
			onImport={noop}
			onCreate={noop}
		>
			{#snippet record(row)}
				<span>{row.id}</span>
			{/snippet}
		</List>
	</Tooltip.Provider>
</DesignProvider>
