<script lang="ts">
	/**
	 * A settings directory with the organization host beside it, under the providers both need.
	 *
	 * Scaffolding rather than a test, and a fixture rather than a `wrapper` of one component for
	 * the reason `./query-providers.svelte` gives. A directory's cards ask the host for what their
	 * acts open, and the host is mounted once in the frame rather than by the directory, so a test
	 * of what a card's act opens renders the two side by side, the way the shell draws them. The
	 * host's hooks are the test's to stand in for: `./host-hooks.ts` holds the stand-ins.
	 */
	import OrganizationHost from '$lib/organization/component/host.svelte';
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
			<!-- the host first, as the frame has it: it is there before any directory asks it for
			     anything, and a surface asked for while the directory mounts opens on it. -->
			<OrganizationHost />
			{@render children()}
		</TooltipProvider>
	</QueryClientProvider>
</DesignProvider>
