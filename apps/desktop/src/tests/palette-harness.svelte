<script lang="ts">
	/**
	 * A screen, with the palette and the application's one keyboard listener beside it.
	 *
	 * Scaffolding rather than a test, and a fixture rather than a `wrapper` because the subject is a
	 * tree: the frame mounts the palette and the listener once, above whatever route is drawn, and
	 * the question is whether the palette answers its key while that route is the one on screen. The
	 * route is handed in as a component and its props, so one fixture draws the settings area and a
	 * record page alike. The three providers are the ones `routes/+layout.svelte` and the frame put
	 * above every screen, nested the same way round.
	 *
	 * **Here rather than in `layout/tests/`** because the tests of several modules render it: the
	 * layout's own, and every record concept's permission tests through `permission.ts`'s
	 * `openPalette` ([[rules/testing]], *Component tests*). A test reaches it as
	 * `#tests/palette-harness.svelte`. *It lived in `layout/tests/` until ticket 19 of effort 838.*
	 */
	import LayoutPalette from '$lib/layout/component/palette.svelte';
	import LayoutShortcutListener from '$lib/layout/component/shortcut-listener.svelte';
	import { TooltipProvider } from '@rentable/design/primitive/tooltip/index.js';
	import {
		DesignProvider,
		type DesignDirection,
		type DesignStrings
	} from '@rentable/design/strings.js';
	import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query';
	import type { Component } from 'svelte';

	let {
		strings,
		direction,
		screen: Screen,
		screenProps
	}: {
		strings: DesignStrings;
		direction: DesignDirection;
		/** the route on screen, drawn with `screenProps`; none where the palette is the subject. */
		screen?: Component<Record<string, unknown>>;
		screenProps?: Record<string, unknown>;
	} = $props();

	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

	let isPaletteOpen = $state(false);
</script>

<DesignProvider {strings} {direction}>
	<QueryClientProvider {client}>
		<TooltipProvider>
			<LayoutShortcutListener />
			<LayoutPalette bind:open={isPaletteOpen} />
			<output data-palette-open={isPaletteOpen}></output>
			{#if Screen}
				<Screen {...screenProps} />
			{/if}
		</TooltipProvider>
	</QueryClientProvider>
</DesignProvider>
