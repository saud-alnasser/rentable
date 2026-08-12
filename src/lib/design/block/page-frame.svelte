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
	 */
	let {
		children,
		class: className
	}: {
		children: Snippet;
		class?: string;
	} = $props();
</script>

<div class={cn('mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col gap-6 p-6', className)}>
	{@render children()}
</div>
