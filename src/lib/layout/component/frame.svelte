<script lang="ts">
	import { page } from '$app/state';
	import api from '$lib/api/caller';
	import WindowControls from '$lib/design/block/window-controls.svelte';
	import { Separator } from '$lib/design/primitive/separator';
	import * as Sidebar from '$lib/design/primitive/sidebar';
	import { locale } from '$lib/i18n/i18n-svelte';
	import LayoutBreadcrumb from '$lib/layout/component/breadcrumb.svelte';
	import LayoutSidebar from '$lib/layout/component/sidebar.svelte';
	import { toBreadcrumbTrail } from '$lib/layout/navigation';
	import type { Snippet } from 'svelte';

	let {
		currentDirection,
		showNavigation,
		children
	}: {
		currentDirection: 'ltr' | 'rtl' | 'auto';
		showNavigation: boolean;
		children: Snippet;
	} = $props();

	const hasBreadcrumb = $derived(toBreadcrumbTrail(page.url.pathname).length > 0);

	function startDragging(event: MouseEvent) {
		if (event.button !== 0) {
			return;
		}

		void api.app.window.drag();
	}
</script>

{#snippet titlebar()}
	<header class="relative flex h-12 shrink-0 items-center gap-2 border-b px-2 select-none">
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			onmousedown={startDragging}
			ondblclick={() => void api.app.window.maximize()}
			class="absolute inset-0 cursor-grab [-webkit-app-region:drag] active:cursor-grabbing"
		></div>

		{#if showNavigation}
			<div class="relative flex min-w-0 items-center gap-2 [-webkit-app-region:no-drag]">
				<Sidebar.Trigger />
				{#if hasBreadcrumb}
					<Separator orientation="vertical" class="data-[orientation=vertical]:h-4" />
					<LayoutBreadcrumb />
				{/if}
			</div>
		{/if}

		<div class="relative ms-auto">
			<WindowControls />
		</div>
	</header>
{/snippet}

<div lang={$locale} dir={currentDirection} class="h-screen w-screen overflow-hidden border">
	{#if showNavigation}
		<Sidebar.Provider class="h-full min-h-0 overflow-hidden">
			<LayoutSidebar />
			<Sidebar.Inset>
				{@render titlebar()}
				<div class="app-scroll @container/main flex min-h-0 flex-1 flex-col overflow-y-auto">
					{@render children?.()}
				</div>
			</Sidebar.Inset>
		</Sidebar.Provider>
	{:else}
		<div class="flex h-full min-h-0 flex-col bg-background">
			{@render titlebar()}
			<main class="app-scroll flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-6 sm:px-6">
				{@render children?.()}
			</main>
		</div>
	{/if}
</div>
