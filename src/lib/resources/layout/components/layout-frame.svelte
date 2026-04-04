<script lang="ts">
	import Navbar from '$lib/common/components/blocks/navbar.svelte';
	import WindowControls from '$lib/common/components/blocks/window-controls.svelte';
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
	class="relative isolate flex h-screen min-h-0 w-screen min-w-0 flex-col overflow-hidden border border-border/50 bg-background/78 shadow-xl backdrop-blur-xl"
>
	<div aria-hidden="true" class="pointer-events-none absolute inset-0 overflow-hidden">
		<div
			class="absolute top-[-10rem] left-[-5rem] h-72 w-72 rounded-full bg-sky-400/7 blur-3xl"
		></div>
		<div
			class="absolute top-[8%] right-[-6rem] h-80 w-80 rounded-full bg-violet-400/6 blur-3xl"
		></div>
		<div
			class="absolute bottom-[-14rem] left-[22%] h-96 w-96 rounded-full bg-emerald-400/4 blur-3xl"
		></div>
	</div>

	<header class="relative z-10 shrink-0">
		<WindowControls />
	</header>

	<main
		class="app-scroll @container/main relative z-10 flex min-h-0 flex-1 scroll-pb-32 flex-col gap-3 overflow-y-auto p-4 pb-32 sm:scroll-pb-36 sm:pb-36"
	>
		{@render children?.()}
	</main>

	{#if showNavbar}
		<Navbar />
	{/if}
</div>
