<script lang="ts">
	/**
	 * The three providers the settings area needs above it.
	 *
	 * Scaffolding rather than a test, and a fixture rather than a `wrapper` for the reason
	 * `organization/tests/providers.svelte` gives: `wrapper` puts exactly one component above the
	 * subject, and this area needs three. Its packaged parts read the design contract; the updates
	 * and diagnostics sections draw a `SurfaceAction`, whose tooltip root reads `TooltipProvider`;
	 * and the blocks it composes own queries of their own, which read the client from context.
	 *
	 * The client is a fresh one per render, with retries off so a query that reaches the shell,
	 * which this runner has none of, settles rather than waits. `routes/+layout.svelte` nests the
	 * three the same way round.
	 */
	import { TooltipProvider } from '@rentable/design/primitive/tooltip/index.js';
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
		<TooltipProvider>
			{@render children()}
		</TooltipProvider>
	</QueryClientProvider>
</DesignProvider>
