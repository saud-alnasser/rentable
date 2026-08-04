<script lang="ts">
	import { locale } from '$lib/i18n/i18n-svelte';
	import { formatLocaleDate } from '$lib/platform/locale';

	/**
	 * A date, as every list renders one.
	 *
	 * Medium style, so a month reads as a word and no locale's numeric order can be mistaken
	 * for another's, and UTC, because the domain's days are whole UTC days.
	 */
	let { value }: { value: number | string | Date } = $props();
</script>

<span class="whitespace-nowrap">
	{formatLocaleDate($locale, value, { dateStyle: 'medium', timeZone: 'UTC' })}
</span>
