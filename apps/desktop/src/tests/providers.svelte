<script lang="ts">
	/**
	 * The providers every component test in this application renders under.
	 *
	 * Scaffolding rather than a test, and a fixture rather than a `wrapper` of one provider because
	 * `wrapper` puts exactly one component above the subject and a screen here needs three. Its
	 * packaged parts read the design contract; a `SurfaceAction`, an icon cluster or a cell with a
	 * tooltip draws one, whose root reads `TooltipProvider`'s context and whose content reads
	 * `DesignProvider`'s; and a section that calls a query hook reads the client from context. The
	 * client is a fresh one per render, with retries off so a query that reaches the shell, which
	 * this runner has none of, settles rather than waits; a test that wants no call at all renders
	 * the section with its query disabled. `shell/component/window.svelte` nests the three the same
	 * way round.
	 *
	 * It provides the workspace cache policy as the root layout does, by loading `$lib/app/cache`,
	 * because a query key is read from it when a section's query runs.
	 *
	 * **The one copy.** Every module's tests render under it, and reach it as
	 * `#tests/providers.svelte` through the `imports` map in `package.json`; the other fixtures
	 * here that put a tree beside the subject (`palette-harness.svelte`, and a concept's own, such
	 * as `organization/tests/host-providers.svelte`) render inside it rather than nesting the three
	 * again. *Until ticket 42 of effort 840 there were four: this one as `query-providers.svelte`,
	 * and a copy with one provider fewer in each of `organization/tests/`, `settings/tests/` and
	 * `design/cell/tests/`.* `[[rules/testing]]` under *Component tests* says why it sits here.
	 *
	 * It takes the string contract's own props and hands them on, so a test passes `wrapperProps`
	 * exactly as it would to `DesignProvider` directly.
	 */
	import '$lib/app/cache';
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
