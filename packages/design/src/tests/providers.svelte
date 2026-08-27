<script lang="ts">
	/**
	 * The two providers a subject that carries a tooltip needs above it.
	 *
	 * Scaffolding rather than a test, and a fixture rather than a `wrapper` for one reason:
	 * `wrapper` puts exactly one component above the subject, and a subject drawing a tooltip
	 * needs two. `Tooltip.Root` reads `Tooltip.Provider`'s context and throws where there is none,
	 * and since #779 its content reads `DesignProvider`'s and throws too.
	 *
	 * It takes the string contract's own props and hands them on, so a test using it as a
	 * `wrapper` passes `wrapperProps` exactly as it would to `DesignProvider` directly. The
	 * consuming application nests them the same way round, in `routes/+layout.svelte`.
	 *
	 * `block/back-control` and `block/record-surface`'s not-found branch are what needed it. The
	 * other block tests in this package render their subjects under `DesignProvider` alone,
	 * because none of them draws a tooltip.
	 */
	import { TooltipProvider } from '#lib/primitive/tooltip/index.js';
	import { DesignProvider, type DesignDirection, type DesignStrings } from '#lib/strings.js';
	import type { Snippet } from 'svelte';

	let {
		strings,
		direction,
		children
	}: { strings: DesignStrings; direction: DesignDirection; children: Snippet } = $props();
</script>

<DesignProvider {strings} {direction}>
	<TooltipProvider>
		{@render children()}
	</TooltipProvider>
</DesignProvider>
