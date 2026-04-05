<script lang="ts">
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
	class="relative isolate flex h-screen min-h-0 w-screen min-w-0 flex-col overflow-hidden border border-border/50 bg-background/78 [box-shadow:inset_0_1px_0_rgb(255_255_255_/_0.05),0_24px_64px_rgb(15_23_42_/_0.2)] backdrop-blur-xl dark:[box-shadow:inset_0_1px_0_rgb(255_255_255_/_0.04),0_24px_64px_rgb(2_6_23_/_0.4)]"
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

	<header class="relative z-10 shrink-0 px-4 pt-4 pb-0 sm:px-6 sm:pt-6 sm:pb-0">
		<div class="mx-auto w-full max-w-7xl">
			<WindowControls {showNavbar} />
		</div>
	</header>

	<main
		class="app-scroll @container/main relative z-10 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pt-3 pb-6 sm:px-6 sm:pb-8"
	>
		{@render children?.()}
	</main>
</div>
