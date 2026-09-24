<script lang="ts">
	/**
	 * The two providers the tenant form needs above it.
	 *
	 * Scaffolding rather than a test, and a fixture rather than a `wrapper` because `wrapper` puts
	 * exactly one component above the subject: the form reads the design contract, and its two
	 * mutations read the query client. The client is a fresh one per render with retries off, the
	 * shape `organization/tests/query-providers.svelte` set.
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

	const client = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
	});
</script>

<DesignProvider {strings} {direction}>
	<QueryClientProvider {client}>
		{@render children()}
	</QueryClientProvider>
</DesignProvider>
