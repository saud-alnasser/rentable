<script lang="ts">
	/**
	 * A phone number, as every list renders one.
	 *
	 * Held at `ltr` whatever the surrounding direction: a number carrying a leading `+` is
	 * read left to right in both locales, and letting it inherit `rtl` moves the country
	 * code to the wrong end of the number.
	 */
	let { phone }: { phone: string } = $props();
</script>

<span dir="ltr" class="whitespace-nowrap tabular-nums">{phone}</span>
