<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import NotFound from '@rentable/design/block/not-found.svelte';
	import PageFrame from '@rentable/design/block/page-frame.svelte';
	import StandaloneSurface from '@rentable/design/block/standalone-surface.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';

	// an address that leads to no page is not a screen that failed: nothing went wrong, there is
	// simply nothing there, and saying it could not be shown would send the reader looking for a
	// fault ([[rules/interface]], *Empty*).
	const isMissing = $derived(page.status === 404);

	// loading the route again, the same answer a caught error gives: a load that failed once may
	// not fail twice, and the reader should not have to leave the screen to find out.
	let isRetrying = $state(false);

	async function retry() {
		isRetrying = true;

		try {
			await invalidateAll();
		} finally {
			isRetrying = false;
		}
	}
</script>

{#if isMissing}
	<!-- the treatment a missing record gets, and the one way back it offers: to the screen the
	     reader came from, or to the dashboard where they came from nowhere. -->
	<PageFrame fills>
		<NotFound
			title={$LL.layout.notFound.title()}
			description={$LL.layout.notFound.description()}
			fallback={resolve('/')}
			class="flex-1"
		/>
	</PageFrame>
{:else}
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

		<!-- the caught error's two, in its order: going home, and last, where the eye lands, trying
		     again ([[rules/interface]], *Error*). -->
		{#snippet actions()}
			<Button variant="outline" href={resolve('/')}>{$LL.layout.error.goHome()}</Button>
			<Button onclick={retry} disabled={isRetrying} data-retry>{$LL.layout.error.retry()}</Button>
		{/snippet}
	</StandaloneSurface>
{/if}
