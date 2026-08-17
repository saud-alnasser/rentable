<script lang="ts">
	import { formatRecordDate } from '$lib/design/date';
	import { locale } from '$lib/i18n/i18n-svelte';

	/** A date, as every list renders one — the rendering itself is `formatRecordDate`'s. */
	let { value }: { value: number | string | Date } = $props();
</script>

<span class="whitespace-nowrap">{formatRecordDate($locale, value)}</span>
