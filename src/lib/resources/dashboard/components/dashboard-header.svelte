<script lang="ts">
	import { formatLocaleDate } from '$lib/common/utils/locale';
	import { LL, locale } from '$lib/i18n/i18n-svelte';

	let { generatedAt }: { generatedAt?: number | null } = $props();

	const formatDateTime = (value: number) =>
		formatLocaleDate($locale, value, {
			dateStyle: 'medium',
			timeStyle: 'short',
			timeZone: 'UTC'
		});
</script>

<div class="flex flex-col gap-1">
	<h1 class="text-3xl font-semibold tracking-tight">{$LL.dashboard.title()}</h1>
	<p class="text-sm text-muted-foreground">{$LL.dashboard.description()}</p>
	{#if generatedAt}
		<p class="text-xs text-muted-foreground">
			{$LL.dashboard.lastSynchronized({ value: formatDateTime(generatedAt) })}
		</p>
	{/if}
</div>
