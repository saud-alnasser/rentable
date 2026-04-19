<script lang="ts">
	import api from '$lib/api/mod';
	import Navbar from '$lib/common/components/blocks/navbar.svelte';
	import { Button } from '$lib/common/components/fragments/button';
	import { LL } from '$lib/i18n/i18n-svelte';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import MinusIcon from '@lucide/svelte/icons/minus';
	import SquareIcon from '@lucide/svelte/icons/square';
	import XIcon from '@lucide/svelte/icons/x';
	import { getCurrentWindow } from '@tauri-apps/api/window';
	import { onMount } from 'svelte';

	let { showNavbar = true }: { showNavbar?: boolean } = $props();
	let isExpanded = $state(false);

	function startDragging(event: MouseEvent) {
		if (event.button !== 0) {
			return;
		}

		void api.app.window.drag();
	}

	function stopEventPropagation(event: MouseEvent) {
		event.stopPropagation();
	}

	async function refreshWindowState() {
		const appWindow = getCurrentWindow();
		isExpanded = (await appWindow.isMaximized()) || (await appWindow.isFullscreen());
	}

	function requestClose() {
		window.dispatchEvent(new CustomEvent('rentable:window-close-request'));
	}

	onMount(() => {
		const appWindow = getCurrentWindow();
		let unlistenResize: (() => void) | undefined;

		void (async () => {
			await refreshWindowState();
			unlistenResize = await appWindow.onResized(() => {
				void refreshWindowState();
			});
		})();

		return () => {
			unlistenResize?.();
		};
	});
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	dir="ltr"
	class="relative min-h-14 w-full rounded-[1.5rem] border border-border/70 bg-card/65 p-2.5 [box-shadow:inset_0_1px_0_rgb(255_255_255_/_0.06),0_20px_48px_rgb(15_23_42_/_0.18)] backdrop-blur-xl select-none dark:[box-shadow:inset_0_1px_0_rgb(255_255_255_/_0.05),0_20px_48px_rgb(2_6_23_/_0.38)]"
>
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		onmousedown={startDragging}
		ondblclick={() => void api.app.window.maximize()}
		class="absolute inset-0 z-10 cursor-grab [-webkit-app-region:drag] active:cursor-grabbing"
	></div>

	<div class="pointer-events-none absolute top-1/2 left-4 z-20 flex -translate-y-1/2 items-center">
		<div
			class="pointer-events-auto flex h-11 min-h-11 w-fit max-w-[11rem] shrink-0 items-center gap-2 px-3 [-webkit-app-region:drag]"
		>
			<div class="size-1.5 rounded-full bg-primary/70 shadow-sm"></div>
			<span class="truncate text-xs font-medium tracking-[0.04em] text-foreground/90"
				>{$LL.app.name()}</span
			>
		</div>
	</div>

	{#if showNavbar}
		<div
			class="pointer-events-none absolute top-1/2 left-1/2 z-20 flex max-w-[calc(100%-10rem)] min-w-0 -translate-x-1/2 -translate-y-1/2 items-center justify-center sm:max-w-[calc(100%-18rem)]"
		>
			<Navbar />
		</div>
	{/if}

	<div class="pointer-events-none absolute top-1/2 right-4 z-20 flex -translate-y-1/2 items-center">
		<div
			class="pointer-events-auto relative flex h-11 min-h-11 shrink-0 items-center gap-0.5 px-1 [-webkit-app-region:drag]"
			ondblclick={stopEventPropagation}
		>
			<Button
				variant="ghost"
				size="icon-sm"
				class="border-border/55 bg-background/50 shadow-none [-webkit-app-region:no-drag]"
				aria-label={$LL.common.window.minimize()}
				onmousedown={stopEventPropagation}
				ondblclick={stopEventPropagation}
				onclick={() => void api.app.window.minimize()}
			>
				<MinusIcon class="size-3.5" />
			</Button>

			<Button
				variant="ghost"
				size="icon-sm"
				class="border-border/55 bg-background/50 shadow-none [-webkit-app-region:no-drag]"
				aria-label={$LL.common.window.toggleMaximize()}
				onmousedown={stopEventPropagation}
				ondblclick={stopEventPropagation}
				onclick={() => {
					void api.app.window.maximize();
					void refreshWindowState();
				}}
			>
				{#if isExpanded}
					<CopyIcon class="size-3.5" />
				{:else}
					<SquareIcon class="size-3.5" />
				{/if}
			</Button>

			<Button
				variant="ghost"
				size="icon-sm"
				class="border-border/55 bg-background/50 shadow-none [-webkit-app-region:no-drag]"
				data-destructive="true"
				aria-label={$LL.common.window.close()}
				onmousedown={stopEventPropagation}
				ondblclick={stopEventPropagation}
				onclick={requestClose}
			>
				<XIcon class="size-3.5" />
			</Button>
		</div>
	</div>
</div>
