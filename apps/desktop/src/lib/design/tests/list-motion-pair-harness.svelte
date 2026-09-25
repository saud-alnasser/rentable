<script lang="ts">
	/**
	 * Two list blocks on one screen, each handed its result set from outside, the way the ledger and
	 * a record's history sit on a contract's page.
	 *
	 * Scaffolding rather than a test, as `list-motion-harness.svelte` is. `first` and `second` are
	 * this fixture's own props, so a test changes both sets in one `rerender`, the way one create
	 * refetches both.
	 */
	import List from '$lib/design/block/list.svelte';
	import * as Tooltip from '@rentable/design/primitive/tooltip/index.js';
	import { DesignProvider } from '@rentable/design/strings.js';
	import { placeholderStrings as strings } from './strings';

	let { first, second }: { first: { id: string }[]; second: { id: string }[] } = $props();
</script>

<DesignProvider {strings} direction="ltr">
	<Tooltip.Provider>
		<div data-list-of="first">
			<List data={first} emptyTitle="nothing here yet">
				{#snippet record(row)}
					<span>{row.id}</span>
				{/snippet}
			</List>
		</div>
		<div data-list-of="second">
			<List data={second} emptyTitle="nothing here yet">
				{#snippet record(row)}
					<span>{row.id}</span>
				{/snippet}
			</List>
		</div>
	</Tooltip.Provider>
</DesignProvider>
