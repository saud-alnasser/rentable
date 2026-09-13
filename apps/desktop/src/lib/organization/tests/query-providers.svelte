<script lang="ts">
	/**
	 * The two providers a section that owns a query needs above it.
	 *
	 * Scaffolding rather than a test, and a fixture rather than a `wrapper` for the reason
	 * `./providers.svelte` gives: `wrapper` puts exactly one component above the subject, and a
	 * section that calls a hook from `organization/query.ts` reads the query client from context
	 * as well as the design contract. The client is a fresh one per render, with retries off so a
	 * query that reaches the shell, which this runner has none of, settles rather than waits; a
	 * test that wants no call at all renders the section with its query disabled.
	 * `routes/+layout.svelte` nests the two the same way round.
	 */
	import {
		DesignProvider,
		type DesignDirection,
		type DesignStrings
	} from '@rentable/design/strings.js';
	import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query';
	import type { Snippet } from 'svelte';

	let {
		strings,
		direction,
		children
	}: { strings: DesignStrings; direction: DesignDirection; children: Snippet } = $props();

	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
</script>

<DesignProvider {strings} {direction}>
	<QueryClientProvider {client}>
		{@render children()}
	</QueryClientProvider>
</DesignProvider>
