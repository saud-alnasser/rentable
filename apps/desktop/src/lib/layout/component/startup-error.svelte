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

<!-- error, and it is the application that has failed rather than a screen: nothing is running
     behind this card. The two toned screens are this one and update recovery, and they do not
     say the same thing as each other. -->
<StandaloneSurface
	tone="error"
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
