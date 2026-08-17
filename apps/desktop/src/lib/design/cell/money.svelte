<script lang="ts">
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { formatLocaleValueWithUnit } from '$lib/platform/locale';

	/** An amount, localized and carrying the currency the application deals in. */
	let { amount }: { amount: number } = $props();
</script>

<span class="tabular-nums">
	{formatLocaleValueWithUnit($locale, amount, $LL.common.messages.sar())}
</span>
