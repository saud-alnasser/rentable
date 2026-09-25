<script lang="ts">
	import { printSheet } from '$lib/print/sheet.svelte';

	/**
	 * The one sheet a page is printed on, mounted once in the frame and outside everything else it
	 * draws.
	 *
	 * Not drawn on screen at all, and the only thing drawn on paper: `app.css` hides every other
	 * region under `@media print`, and this shows itself there, static and at the page's full
	 * width, in the light appearance whatever the window is in. It sits outside the frame's own
	 * root rather than inside the scrolling main, because that root clips to the window and a
	 * schedule runs to more than one page.
	 *
	 * It carries the reading language and direction itself, since nothing above it in the tree
	 * does: the frame sets both on its own root, which this is a sibling of.
	 */
	let { lang, dir }: { lang: string; dir: 'ltr' | 'rtl' | 'auto' } = $props();
</script>

<div {lang} {dir} class="paper hidden bg-card text-sm text-foreground print:block" data-print-sheet>
	{@render printSheet.content?.()}
</div>
