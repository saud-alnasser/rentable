<script lang="ts">
	/**
	 * Words a person typed, as a row or a title draws them: a name, an address, a location.
	 *
	 * The value is isolated in a `<bdi>`, so it runs in its own direction whatever the line around
	 * it runs in. Without it a Latin value inside an Arabic line is reordered by the bidi algorithm:
	 * "Adeline Wiegand Sr." reads ".Adeline Wiegand Sr", and "4253 Russel Motorway" reads
	 * "Russel Motorway 4253". An Arabic value inside an English line is reordered the same way.
	 *
	 * The isolate is inline and inside the box the caller styles, rather than `dir="auto"` on that
	 * box, because `dir` also decides which edge the box aligns to: a Latin name in a block of its
	 * own would sit at the left of an Arabic row. A machine's string is not this cell's: a phone
	 * number or a code states `dir="ltr"` ([[rules/frontend]], *i18n*).
	 */
	let { text, class: className }: { text: string; class?: string } = $props();
</script>

<span class={className}><bdi>{text}</bdi></span>
