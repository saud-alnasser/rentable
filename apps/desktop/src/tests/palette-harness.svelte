<script lang="ts">
	/**
	 * A screen, with the palette and the application's one keyboard listener beside it.
	 *
	 * Scaffolding rather than a test, and a fixture rather than a `wrapper` because the subject is a
	 * tree: the frame mounts the palette and the listener once, above whatever route is drawn, and
	 * the question is whether the palette answers its key while that route is the one on screen. The
	 * route is handed in as a component and its props, so one fixture draws the settings area and a
	 * record page alike. It draws them inside `providers.svelte`, the providers every component test
	 * here renders under, which also bring the workspace cache policy a screen's query reads its key
	 * from.
	 *
	 * **Here rather than in `palette/tests/`** because the tests of several modules render it: the
	 * palette's own, and every record concept's permission tests through `permission.ts`'s
	 * `openPalette` ([[rules/testing]], *Component tests*). A test reaches it as
	 * `#tests/palette-harness.svelte`. *It lived in `shell/tests/` until ticket 19 of effort 838.*
	 *
	 * The palette is handed what the frame hands it: the menu `app/` builds from the surfaces, and
	 * the places the reader may go to.
	 */
	import { palette } from '$lib/app/surfaces';
	import { primaryDestinations, secondaryDestinations } from '$lib/shell/destination';
	import { toViewablePlaces } from '$lib/shell/navigation';
	import { Palette } from '$lib/palette/ui';
	import { memberPermissions } from '$lib/permission';
	import { ShortcutListener } from '$lib/shortcut/ui';
	import type { DesignDirection, DesignStrings } from '@rentable/design/strings.js';
	import type { Component } from 'svelte';
	import Providers from './providers.svelte';

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

	let isPaletteOpen = $state(false);
</script>

<Providers {strings} {direction}>
	<ShortcutListener />
	<Palette
		bind:open={isPaletteOpen}
		{palette}
		destinations={toViewablePlaces(
			[...primaryDestinations, ...secondaryDestinations],
			memberPermissions.views
		)}
	/>
	<output data-palette-open={isPaletteOpen}></output>
	{#if Screen}
		<Screen {...screenProps} />
	{/if}
</Providers>
