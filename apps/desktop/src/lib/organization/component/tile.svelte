<script lang="ts">
	/**
	 * The organization's tile: a tinted square holding the first letter of its name, which is what
	 * tells one organization from another wherever it is drawn, since the mark is sealed and an
	 * organization has no picture before sign-in (effort 851, *Assumptions*). `primitive/avatar` is
	 * for people.
	 *
	 * **One drawing for every place an organization is named by its tile**: the switcher's trigger
	 * and rows (`switcher.svelte`), and the organization tab's name card (`name.svelte`), so the
	 * reader meets the same square for the same organization. `card` is the settings card's glyph
	 * size, the trigger's too; `row` is a menu row's.
	 */
	let { name, size }: { name: string; size: 'card' | 'row' } = $props();

	/** the name's first character as a reader sees it, raised where it has case. */
	const initial = $derived(Array.from(name.trim())[0]?.toLocaleUpperCase() ?? '');
</script>

<span
	class="flex shrink-0 items-center justify-center bg-primary/10 font-semibold text-primary {size ===
	'card'
		? 'size-8 rounded-lg text-sm'
		: 'size-5 rounded-sm text-xs'}"
	aria-hidden="true"
	data-organization-tile
>
	{initial}
</span>
