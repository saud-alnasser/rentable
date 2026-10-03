<script lang="ts" module>
	/**
	 * The line height every line of a tile's facts is drawn at: 20 px, in both locales.
	 *
	 * **It is part of a tile's height, not a matter of taste.** A list lays its tiles at a declared
	 * height rather than measuring them, and a line left to inherit its leading is 16 px in English
	 * and nearly 22 px in Arabic, whose Readex Pro sets a taller line. The tiles measured on real
	 * data overflowed by 7 to 18 px in Arabic until each line set its own (effort 846, the cards on
	 * real data). A concept's declared tile height counts its lines at this measure.
	 */
	export const factLeading = 'leading-5';
</script>

<script lang="ts">
	import { cn } from '@rentable/design/tailwind.js';
	import type IdCardIcon from '@lucide/svelte/icons/id-card';
	import type { Snippet } from 'svelte';

	type IconComponent = typeof IdCardIcon;

	/**
	 * One fact on a tile, a line of its own: the glyph standing for what the fact is, then the fact.
	 *
	 * Muted and small, with the glyph smaller still and dimmed, so the glyphs down a tile do not
	 * outweigh the words beside them (_Balance weight and contrast_, 56). The glyph is what labels
	 * the fact, so a tile needs no *phone* or *national id* written beside a number (_Labels are a
	 * last resort_, 48).
	 *
	 * Inert to the pointer and raised over the card's link, as everything a record card holds has
	 * to be.
	 */
	let {
		icon: Icon,
		children,
		class: className
	}: {
		/** the glyph standing for what the fact is. */
		icon: IconComponent;
		/** the fact itself. */
		children: Snippet;
		class?: string;
	} = $props();
</script>

<span
	data-fact
	class={cn(
		'pointer-events-none relative flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground',
		factLeading,
		className
	)}
>
	<Icon class="size-3.5 shrink-0 opacity-70" aria-hidden="true" />
	{@render children()}
</span>
