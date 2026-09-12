<script lang="ts">
	/**
	 * The two providers a screen carrying a corner control needs above it.
	 *
	 * Scaffolding rather than a test, and a fixture rather than a `wrapper` for the reason
	 * `packages/design/src/tests/providers.svelte` gives: `wrapper` puts exactly one component
	 * above the subject, and a `SurfaceAction` draws a tooltip, whose root reads
	 * `TooltipProvider`'s context and whose content reads `DesignProvider`'s. The package does not
	 * export its own copy, since its `exports` map covers `src/lib/` alone, so this application
	 * keeps one beside the tests that render those screens. `routes/+layout.svelte` nests the two
	 * the same way round.
	 *
	 * It takes the string contract's own props and hands them on, so a test passes `wrapperProps`
	 * exactly as it would to `DesignProvider` directly.
	 */
	import { TooltipProvider } from '@rentable/design/primitive/tooltip/index.js';
	import {
		DesignProvider,
		type DesignDirection,
		type DesignStrings
	} from '@rentable/design/strings.js';
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
