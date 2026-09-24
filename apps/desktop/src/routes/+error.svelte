<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import StandaloneSurface from '@rentable/design/block/standalone-surface.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';

	// an address that leads to no page is not a screen that failed: nothing went wrong, there is
	// simply nothing there, and saying it could not be shown would send the reader looking for a
	// fault ([[rules/interface]], *Empty*).
	const isMissing = $derived(page.status === 404);
</script>

<!-- neutral, and deliberately: a crashed route is contained and the shell around it is still
     working. The tone marks the application failing, not a screen failing. -->
<StandaloneSurface
	tone="neutral"
	title={isMissing ? $LL.layout.notFound.title() : $LL.layout.error.title()}
	description={isMissing ? $LL.layout.notFound.description() : $LL.layout.error.description()}
>
	<!-- the status and the message are for whoever is asked what happened; the sentence above
	     is for the reader, who met this because nothing anticipated it. A missing page has nothing
	     to report beyond the sentence. -->
	{#if !isMissing}
		<p class="text-sm text-muted-foreground tabular-nums">
			{page.status}{page.error?.message ? ` · ${page.error.message}` : ''}
		</p>
	{/if}

	{#snippet actions()}
		<Button href={resolve('/')}>{$LL.layout.error.goHome()}</Button>
	{/snippet}
</StandaloneSurface>
