<script lang="ts">
	/**
	 * A settings row carrying a menu, as a growing list's row draws one.
	 *
	 * Scaffolding rather than a test. The row's menu holds a tooltip for a refused act, and a
	 * tooltip reads its provider from above, as the application's sidebar provider is; the row is a
	 * list item, so it sits in a list. Everything the test drives is a prop.
	 */
	import SettingsRow, { type SettingsRowMenu } from '#lib/block/settings-row.svelte';
	import * as Tooltip from '#lib/primitive/tooltip/index.js';
	import LaptopIcon from '@lucide/svelte/icons/laptop';

	let { name = 'the laptop', menu }: { name?: string; menu?: SettingsRowMenu } = $props();
</script>

<Tooltip.Provider delayDuration={0}>
	<div role="list">
		<SettingsRow icon={LaptopIcon} {name} meta="last seen today" {menu} />
	</div>
</Tooltip.Provider>
