<script lang="ts">
	import { page } from '$app/state';
	import api from '$lib/api/caller';
	import { Button } from '$lib/design/primitive/button';
	import { Kbd } from '$lib/design/primitive/kbd';
	import { Separator } from '$lib/design/primitive/separator';
	import * as Sidebar from '$lib/design/primitive/sidebar';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import LayoutBreadcrumb from '$lib/layout/component/breadcrumb.svelte';
	import LayoutPalette, { PALETTE_SHORTCUT_HINT } from '$lib/layout/component/palette.svelte';
	import LayoutShortcutListener from '$lib/layout/component/shortcut-listener.svelte';
	import LayoutShortcutSheet from '$lib/layout/component/shortcut-sheet.svelte';
	import LayoutSidebar from '$lib/layout/component/sidebar.svelte';
	import LayoutUndoShortcut from '$lib/layout/component/undo-shortcut.svelte';
	import LayoutWindowControls from '$lib/layout/component/window-controls.svelte';
	import { toBreadcrumbTrail } from '$lib/layout/navigation';
	import KeyboardIcon from '@tabler/icons-svelte/icons/keyboard';
	import SearchIcon from '@tabler/icons-svelte/icons/search';
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

	let isPaletteOpen = $state(false);
	let isShortcutSheetOpen = $state(false);

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
				<Button
					variant="outline"
					size="sm"
					aria-label={$LL.common.ui.commandPalette()}
					onclick={() => (isPaletteOpen = true)}
					class="ms-2 gap-2 text-muted-foreground"
				>
					<SearchIcon />
					<span class="capitalize">{$LL.common.ui.search()}</span>
					<!-- a key name is not prose: it is what is printed on the keyboard, and the
					     keyboard does not change with the locale. -->
					<Kbd dir="ltr">{PALETTE_SHORTCUT_HINT}</Kbd>
				</Button>

				<!-- the only way into the sheet, and deliberately not a shortcut of its own: a
				     reader who does not know the application answers keys cannot press one. -->
				<Button
					variant="ghost"
					size="icon"
					aria-label={$LL.common.ui.keyboardShortcuts()}
					onclick={() => (isShortcutSheetOpen = true)}
					class="text-muted-foreground"
				>
					<KeyboardIcon />
				</Button>
			</div>
		{/if}

		<div class="relative ms-auto">
			<LayoutWindowControls />
		</div>
	</header>
{/snippet}

<!-- the application's one keyboard listener, and outside the navigation with the undo pair it
     answers: a change made on a screen that carries no navigation is still a change the reader
     can take back. -->
<LayoutShortcutListener />
<LayoutUndoShortcut />

<div lang={$locale} dir={currentDirection} class="h-screen w-screen overflow-hidden border">
	{#if showNavigation}
		<LayoutPalette bind:open={isPaletteOpen} />
		<LayoutShortcutSheet bind:open={isShortcutSheetOpen} />
		<Sidebar.Provider class="h-full min-h-0 overflow-hidden">
			<LayoutSidebar />
			<Sidebar.Inset>
				{@render titlebar()}
				<div class="@container/main flex min-h-0 flex-1 flex-col overflow-y-auto">
					{@render children?.()}
				</div>
			</Sidebar.Inset>
		</Sidebar.Provider>
	{:else}
		<div class="flex h-full min-h-0 flex-col bg-background">
			{@render titlebar()}
			<main class="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-6 sm:px-6">
				{@render children?.()}
			</main>
		</div>
	{/if}
</div>
