<script lang="ts">
	import { cn } from '$lib/design/tailwind';
	import type { Snippet } from 'svelte';

	/**
	 * The frame every screen sits in.
	 *
	 * One maximum width and one padding, declared here and nowhere else. The route wrappers used
	 * to each declare their own — four widths across three padding recipes, one of which reserved
	 * a large trailing gap on a single screen — so the application changed shape as the reader
	 * moved through it. Nothing had decided that; each screen had decided it separately.
	 *
	 * The width is the content's rather than the window's (_Grids are overrated_): a screen that
	 * genuinely needs a different one passes it through `class` and thereby says so out loud,
	 * which is what distinguishes a decision from a guess.
	 *
	 * **The frame grows with its content, and a screen that needs a window-height one asks.** The
	 * frame sits inside the shell's scrolling column, so a frame claiming a share of that column's
	 * height is exactly one viewport tall however long its content is — and its own bottom padding
	 * then sits at the window's edge rather than after the last element, which is a page ending
	 * flush against the window on every screen long enough to scroll.
	 *
	 * Growing is the default because most screens are a column of content, and the screens that
	 * need the other answer are the ones whose own lists scroll: they have to be exactly as tall as
	 * the window or there is no height for a list to scroll inside. Making the growing case the
	 * default and the fixed case opt-in matches what the two kinds of screen are, rather than
	 * serving every screen the scrolling ones' answer.
	 */
	let {
		children,
		fills = false,
		class: className
	}: {
		children: Snippet;
		/**
		 * Whether this screen takes the window's height rather than its content's.
		 *
		 * Set it only where something inside scrolls on its own — a directory's list, a record's
		 * collection. A screen that sets it and has nothing scrolling inside it cannot be scrolled
		 * to its own bottom.
		 */
		fills?: boolean;
		class?: string;
	} = $props();
</script>

<div
	class={cn(
		'mx-auto flex w-full max-w-5xl flex-col gap-6 p-6',
		fills && 'min-h-0 flex-1',
		className
	)}
>
	{@render children()}
</div>
