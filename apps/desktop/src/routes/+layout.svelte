<script lang="ts">
	// First, and in this order, because each binds something before anything below it can run:
	// the root router into `$lib/api/caller`, the cache policy into `$lib/mutation`, every
	// feature's sheets into `$lib/transfer`, and every feature's surface, with what the surfaces
	// contribute, into `$lib/feature/surface`. They head this module so they head the application's
	// module graph: nothing below can call a procedure, read a query key, open a file or read a
	// contribution before its binding is in place.
	import '$lib/app/caller';
	import '$lib/app/cache';
	import '$lib/app/transfer';
	import '$lib/app/surfaces';
	import { page } from '$app/state';
	import { host } from '$lib/app/host';
	import LayoutFrame from '$lib/shell/component/frame.svelte';
	import ShellWindow from '$lib/shell/component/window.svelte';
	import StartupRoot from '$lib/startup/component/root.svelte';
	import { toScreen } from '@rentable/design/back.js';
	import { back } from '@rentable/design/back.svelte.js';
	import '../app.css';

	/**
	 * Every screen is inside this one, and what it draws is composed here and decided elsewhere.
	 *
	 * Startup's root owns the unit, its listeners, and which of its screens or the routed page goes
	 * inside the frame (`$lib/startup/component/root.svelte`). The shell owns the window those are
	 * drawn in (`$lib/shell/component/window.svelte`), and neither can import the other, so this
	 * hands the shell's window to startup's root to draw its state in.
	 */
	let { children } = $props();

	// the application's own trail, so a back control returns to the screen that opened a record
	// rather than to a fixed place. It is recorded here because every screen is inside this one.
	$effect(() => {
		back.visit(toScreen(page.url));
	});
</script>

<StartupRoot {host}>
	{#snippet shellWindow(running)}
		<ShellWindow {...running} />
	{/snippet}

	{#snippet bareFrame(inside)}
		<LayoutFrame currentDirection="ltr" shell="bare">
			{@render inside()}
		</LayoutFrame>
	{/snippet}

	{@render children?.()}
</StartupRoot>
