<script lang="ts">
	import WindowControls from '$lib/design/block/window-controls.svelte';
	import { locale } from '$lib/i18n/i18n-svelte';
	import type { Snippet } from 'svelte';

	let {
		currentDirection,
		showNavbar,
		children
	}: {
		currentDirection: 'ltr' | 'rtl' | 'auto';
		showNavbar: boolean;
		children: Snippet;
	} = $props();
</script>

<div
	lang={$locale}
	dir={currentDirection}
	class="flex h-screen min-h-0 w-screen min-w-0 flex-col overflow-hidden border bg-background"
>
	<header class="shrink-0 px-4 pt-4 pb-0 sm:px-6 sm:pt-6 sm:pb-0">
		<div class="mx-auto w-full max-w-7xl">
			<WindowControls {showNavbar} />
		</div>
	</header>

	<main
		class="app-scroll @container/main flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pt-3 pb-6 sm:px-6 sm:pb-8"
	>
		{@render children?.()}
	</main>
</div>
