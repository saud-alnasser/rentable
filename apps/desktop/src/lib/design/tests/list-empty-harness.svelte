<script lang="ts">
	/**
	 * The list block with nothing to show, under whatever search and filter a test hands it.
	 *
	 * Scaffolding rather than a test, and a fixture rather than a `wrapper` because the block takes
	 * a snippet and needs two providers. The search and the filter are bound and written out, so a
	 * test reads what pressing the empty state's act put down.
	 */
	import List from '$lib/design/block/list.svelte';
	import type { FilterSelection, ListFilter } from '$lib/design/filter';
	import * as Tooltip from '@rentable/design/primitive/tooltip/index.js';
	import { DesignProvider } from '@rentable/design/strings.js';
	import { untrack } from 'svelte';
	import { placeholderStrings as strings } from './strings';

	let {
		initialSearch = '',
		initialFilters = {},
		onCreate
	}: {
		initialSearch?: string;
		initialFilters?: FilterSelection;
		onCreate?: () => void;
	} = $props();

	const status: ListFilter = {
		kind: 'choice',
		id: 'status',
		label: () => 'status',
		options: [
			{ id: 'open', label: () => 'open' },
			{ id: 'closed', label: () => 'closed' }
		]
	};

	let search = $state(untrack(() => initialSearch));
	let filters = $state<FilterSelection>(untrack(() => initialFilters));
</script>

<DesignProvider {strings} direction="ltr">
	<Tooltip.Provider>
		<List
			data={[] as { id: string }[]}
			bind:search
			bind:filters
			filterOptions={[status]}
			{onCreate}
			emptyTitle="no tenants yet"
			emptyDescription="tenants you add will be listed here."
		>
			{#snippet record(row)}
				<span>{row.id}</span>
			{/snippet}
		</List>
		<output data-search>{search}</output>
		<output data-filters>{JSON.stringify(filters)}</output>
	</Tooltip.Provider>
</DesignProvider>
