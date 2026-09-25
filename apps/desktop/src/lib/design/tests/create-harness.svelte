<script lang="ts">
	/**
	 * The create key as the frame registers it, the application's one listener, and a create
	 * control where the test puts one: what a screen with a set on it, or without one, draws.
	 *
	 * Scaffolding rather than a test: the control needs the string contract and the tooltip's
	 * provider, and a component test cannot write either in a `.ts` file.
	 */
	import CreateControl from '$lib/design/block/create-control.svelte';
	import LayoutCreateShortcut from '$lib/layout/component/create-shortcut.svelte';
	import LayoutShortcutListener from '$lib/layout/component/shortcut-listener.svelte';
	import * as Tooltip from '@rentable/design/primitive/tooltip/index.js';
	import { DesignProvider } from '@rentable/design/strings.js';
	import { placeholderStrings as strings } from './strings';

	let {
		sets = []
	}: {
		/** the sets on screen, in the order they are drawn, each by what its control creates. */
		sets?: { label: string; onCreate: () => void; unavailable?: string }[];
	} = $props();
</script>

<DesignProvider {strings} direction="ltr">
	<Tooltip.Provider>
		<LayoutShortcutListener />
		<LayoutCreateShortcut />

		{#each sets as set (set.label)}
			<CreateControl label={set.label} onCreate={set.onCreate} unavailable={set.unavailable} />
		{/each}
	</Tooltip.Provider>
</DesignProvider>
