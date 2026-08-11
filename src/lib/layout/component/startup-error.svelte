<script lang="ts">
	import StandaloneSurface from '$lib/design/block/standalone-surface.svelte';
	import { Button } from '$lib/design/primitive/button';
	import { LL } from '$lib/i18n/i18n-svelte';

	let {
		message,
		onRetry
	}: {
		message: string | null;
		onRetry: () => void;
	} = $props();
</script>

<StandaloneSurface
	title={$LL.layout.startup.failedToStartTitle()}
	description={$LL.layout.startup.failedToStartDescription()}
>
	{#if message}
		<p class="text-sm text-muted-foreground">{message}</p>
	{/if}

	{#snippet actions()}
		<Button onclick={onRetry}>{$LL.common.actions.retryStartup()}</Button>
	{/snippet}
</StandaloneSurface>
