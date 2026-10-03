<script lang="ts" module>
	/**
	 * how many rows of cards a bounded settings directory shows before it scrolls, at a number of
	 * columns: two rows at one or two across, so two cards or four, and as many rows as columns
	 * past that, so nine at three (effort 846, ticket 53, the human's word of 2026-10-03). The
	 * columns stop at three, so three rows is the most there are.
	 */
	export const rowsInView = (columns: number) => Math.max(2, columns);
</script>

<script lang="ts">
	import { columnsFor, RECORD_TILE_MIN_WIDTH } from '$lib/list';
	import { tick, type Snippet } from 'svelte';

	/**
	 * The cards of a settings directory, as tiles in a grid, under the tray the directory draws
	 * above them (`./directory-tray.svelte`).
	 *
	 * **The columns are read off the directory's own width** by the list shell's rule (`columnsFor`,
	 * `RECORD_TILE_MIN_WIDTH`), as many as there is room for and never more than three, and every
	 * tile stands at the height its card declares (`tileHeight`). The width is measured on the
	 * outside of the scroll area, so a scrollbar appearing never changes how many columns there are.
	 *
	 * **A `bounded` directory shows a few rows of cards and scrolls past them** (effort 846, ticket
	 * 53, the human's walks of 2026-10-03: "more will result in a scorlling area for that directory
	 * of records", and "for mobile size 2 cards then becomes an area of scroll; for mid screen 2
	 * columns become 4 cards meaning 2x2; for full screen 3x3 cards 9 cards"). The columns stay the
	 * list shell's, one, two or three by the width, and the rows in view follow them
	 * (`rowsInView`): two cards at one across, four at two, nine at three. The area is exactly as
	 * tall as those rows, their gaps counted, so no card is cut in half, and it is computed again
	 * whenever the width changes the columns. With fewer cards the area is as tall as they are and
	 * no taller. The tray stays above, outside the area, so the search and the plus never scroll
	 * away.
	 *
	 * **The area is the platform's own scroll**: a native overflow, as every other bounded list in
	 * the application scrolls (`list/component/rows.svelte`, `form-surface.svelte`), with no
	 * scrollbar drawn by hand. It is a region named by the directory's heading, so a screen reader
	 * announces it, and its cards are the tab order's as before. Where more is below, the foot of
	 * the area fades: a still mask, never a movement, for a system that hides its scrollbar until
	 * the pointer moves. Keyboard focus reaching a card the area cuts off brings the whole card
	 * into view at once (`block: 'nearest'`, no smooth scroll, so reduced motion holds), and a press
	 * does not, since the card under the pointer must not move before the click lands. The bound is
	 * a height and the padding is logical, so the area reads the same in both directions.
	 *
	 * **Which directories are bounded** is the caller's to say. The settings directories are:
	 * members, roles and workspaces. A workspace page's members are not: they are the only
	 * collection on their page, so the page's own scroll is theirs, and a second scroll inside it
	 * would nest one in the other.
	 */
	let {
		count,
		tileHeight,
		bounded = false,
		labelledBy,
		children,
		...attributes
	}: {
		/** how many cards the grid is showing, which decides whether the area overflows. */
		count: number;
		/** the height every tile stands at, the card component's declared height. */
		tileHeight: number;
		/** whether the cards scroll past a few rows inside their own area, or with the surface. */
		bounded?: boolean;
		/** the id of the heading that names the area for a screen reader. */
		labelledBy: string;
		/** the tiles, and the empty treatment spanning every column where there are none. */
		children: Snippet;
		/** what the grid itself is marked with, which the directory is read by. */
		[attribute: `data-${string}`]: unknown;
	} = $props();

	/** the gap between two tiles, the list shell's `gap-3`. */
	const TILE_GAP = 12;
	/** the padding round the grid inside the area, so a card's ring and shadow are not cut. */
	const AREA_PADDING = 4;
	/** the directory's own width, which the tiles divide. */
	let width = $state(0);
	const columns = $derived(columnsFor(width, RECORD_TILE_MIN_WIDTH, TILE_GAP));
	/** the rows in view at the columns the width gives. */
	const rows = $derived(rowsInView(columns));
	/** the tallest the area stands, exactly those rows and their gaps. */
	const bound = $derived(
		bounded ? rows * tileHeight + (rows - 1) * TILE_GAP + AREA_PADDING * 2 : undefined
	);

	let area = $state<HTMLElement | null>(null);
	let grid = $state<HTMLElement | null>(null);
	/** whether cards stand below what the area shows, which the fade at its foot says. */
	let moreBelow = $state(false);
	/** whether the focus about to arrive came from a press rather than the keyboard. */
	let pressing = false;

	const measure = () => {
		if (!area) return;

		moreBelow = area.scrollTop + area.clientHeight < area.scrollHeight - 1;
	};

	// the cards change and the area is measured again, once they are drawn.
	$effect(() => {
		void count;
		void bound;
		void tick().then(measure);
	});

	/** the tile holding a focused element: the grid's own child it sits inside. */
	const tileOf = (target: EventTarget | null) => {
		let node = target instanceof HTMLElement ? target : null;

		while (node && node.parentElement !== grid) node = node.parentElement;

		return node;
	};

	const onfocusin = (event: FocusEvent) => {
		if (pressing) {
			pressing = false;

			return;
		}

		// the whole card, its menu included, at once: instant, so nothing moves under reduced motion.
		tileOf(event.target)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
	};

	// the fade covers the last few pixels of the area, never a card's own words.
	const FADE = '[mask-image:linear-gradient(to_bottom,black_calc(100%_-_24px),transparent)]';
</script>

<svelte:window onpointerup={() => (pressing = false)} />

{#snippet tiles()}
	<!-- the tiles in a grid, as many to a row as there is room for at 300 pixels each, in source
	     order. -->
	<div
		bind:this={grid}
		class="grid gap-3"
		style:grid-template-columns="repeat({columns}, minmax(0, 1fr))"
		data-columns={columns}
		data-tile-height={tileHeight}
		{...attributes}
	>
		{@render children()}
	</div>
{/snippet}

<div bind:clientWidth={width} class="min-w-0" data-directory-grid>
	{#if bounded}
		<!-- the bounded area: the platform's scroll, named by the directory's heading, its padding
		     outset by the same margin so the cards line up with the tray above. -->
		<div
			bind:this={area}
			role="region"
			aria-labelledby={labelledBy}
			class={['-m-1 overflow-y-auto overscroll-contain p-1', moreBelow && FADE]}
			style:max-height="{bound}px"
			data-directory-scroll
			data-rows={rows}
			data-more-below={moreBelow ? '' : undefined}
			onscroll={measure}
			onpointerdown={() => (pressing = true)}
			{onfocusin}
		>
			{@render tiles()}
		</div>
	{:else}
		{@render tiles()}
	{/if}
</div>
