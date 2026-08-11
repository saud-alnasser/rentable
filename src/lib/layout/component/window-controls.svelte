<script lang="ts">
	import api from '$lib/api/caller';
	import { Button } from '$lib/design/primitive/button';
	import { LL } from '$lib/i18n/i18n-svelte';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import MinusIcon from '@lucide/svelte/icons/minus';
	import SquareIcon from '@lucide/svelte/icons/square';
	import XIcon from '@lucide/svelte/icons/x';
	import { getCurrentWindow } from '@tauri-apps/api/window';
	import { onMount } from 'svelte';

	let isExpanded = $state(false);

	function stopEventPropagation(event: MouseEvent) {
		event.stopPropagation();
	}

	async function refreshWindowState() {
		const appWindow = getCurrentWindow();
		isExpanded = (await appWindow.isMaximized()) || (await appWindow.isFullscreen());
	}

	// the root layout owns closing: it has to sync and hide before the window goes, and
	// this component cannot see that state.
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

<!-- the group mirrors with the shell rather than pinning itself LTR: close belongs at the
     window's outer corner in both locales, which is where Windows puts it when it mirrors. -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="flex shrink-0 items-center gap-0.5 [-webkit-app-region:no-drag]"
	ondblclick={stopEventPropagation}
>
	<Button
		variant="ghost"
		size="icon-sm"
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
		data-destructive="true"
		aria-label={$LL.common.window.close()}
		onmousedown={stopEventPropagation}
		ondblclick={stopEventPropagation}
		onclick={requestClose}
	>
		<XIcon class="size-3.5" />
	</Button>
</div>
