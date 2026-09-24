<script lang="ts">
	/**
	 * The two providers a cell carrying a tooltip needs above it.
	 *
	 * A fixture rather than a `wrapper` for the reason `organization/tests/providers.svelte` gives:
	 * a tooltip's root reads `TooltipProvider`'s context and its content reads `DesignProvider`'s,
	 * and `wrapper` puts exactly one component above the subject. The strings are the shared
	 * placeholders, since no assertion on a cell looks for a package string.
	 */
	import { TooltipProvider } from '@rentable/design/primitive/tooltip/index.js';
	import { DesignProvider } from '@rentable/design/strings.js';
	import { placeholderStrings } from '$lib/design/tests/strings';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
</script>

<DesignProvider strings={placeholderStrings} direction="ltr">
	<TooltipProvider>
		{@render children()}
	</TooltipProvider>
</DesignProvider>
