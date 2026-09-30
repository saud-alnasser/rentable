<script lang="ts">
	/**
	 * A list block whose records are each a button, the one tab stop a record card offers, so a test
	 * can see where the focus landed. The navigation hook is registered here as the root layout
	 * registers it.
	 *
	 * Scaffolding rather than a test, as `list/tests/list-motion-harness.svelte` is. `data` is
	 * this fixture's own prop, so a test changes the result set with `rerender` exactly as a
	 * refetch would.
	 */
	import { List } from '$lib/list/ui';
	import { dropLandingOnNavigation } from '$lib/create/ui';
	import * as Tooltip from '@rentable/design/primitive/tooltip/index.js';
	import { DesignProvider } from '@rentable/design/strings.js';
	import { placeholderStrings as strings } from '$lib/design/tests/strings';

	let { data, isShown = true }: { data: { id: string }[]; isShown?: boolean } = $props();

	dropLandingOnNavigation();
</script>

<DesignProvider {strings} direction="ltr">
	<Tooltip.Provider>
		{#if isShown}
			<List {data} emptyTitle="nothing here yet">
				{#snippet record(row)}
					<button type="button">{row.id}</button>
				{/snippet}
			</List>
		{/if}
	</Tooltip.Provider>
</DesignProvider>
