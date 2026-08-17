<script lang="ts">
	import { locale } from '$lib/i18n/i18n-svelte';
	import { formatLocaleMoney } from '$lib/platform/locale';

	/** An amount, localized and carrying the currency the application deals in. */
	let { amount }: { amount: number } = $props();
</script>

<span class="tabular-nums">
	{formatLocaleMoney($locale, amount)}
</span>
