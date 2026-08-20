<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import StandaloneSurface from '$lib/design/block/standalone-surface.svelte';
	import { Button } from '$lib/design/primitive/button';
	import { LL } from '$lib/i18n/i18n-svelte';
</script>

<!-- neutral, and deliberately: a crashed route is contained and the shell around it is still
     working. The tone marks the application failing, not a screen failing. -->
<StandaloneSurface
	tone="neutral"
	title={$LL.layout.error.title()}
	description={$LL.layout.error.description()}
>
	<!-- the status and the message are for whoever is asked what happened; the sentence above
	     is for the reader, who met this because nothing anticipated it. -->
	<p class="text-sm text-muted-foreground tabular-nums">
		{page.status}{page.error?.message ? ` · ${page.error.message}` : ''}
	</p>

	{#snippet actions()}
		<Button href={resolve('/')}>{$LL.layout.error.goHome()}</Button>
	{/snippet}
</StandaloneSurface>
