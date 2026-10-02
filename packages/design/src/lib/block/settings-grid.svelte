<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * A settings section's cards, one under the next in a single column (effort 846, requirement 1
	 * as revised on 2026-10-02, at the human's word after walking the built settings: "each card is
	 * under the next card").
	 *
	 * **One column at every width, in every tab.** Every settings pane the research read is one
	 * column, and the two-column grid this block drew for a day put two short cards side by side
	 * and a long one across both, so the eye zigzagged and the tabs disagreed about where a card
	 * stood. *It was a grid of two columns by container query, with cards that spanned both, until
	 * ticket 31 of effort 846.*
	 *
	 * **Reading order is source order**, which a single column cannot break: what a keyboard and a
	 * screen reader meet is what the eye sees. The cards that end something are written last, so
	 * they are drawn last.
	 *
	 * **A directory stands further from its neighbours than a card does** (`data-settings-directory`):
	 * its heading, its bar and its record cards sit 12 pixels apart, so the space around it is
	 * made larger than that, or its heading would read as the foot of the cards above it (*Avoid
	 * ambiguous spacing*).
	 *
	 * **The content is capped near 1100 pixels**, where a settings pane stops growing (Microsoft's
	 * guidance, about 1000 to 1100), so a card never becomes a strip across a wide window (*You
	 * don't have to fill the whole screen*).
	 */
	let { children }: { children: Snippet } = $props();
</script>

<div
	data-settings-grid
	class="flex w-full max-w-[1100px] flex-col gap-4 [&>[data-settings-directory]]:my-4 [&>[data-settings-directory]+[data-settings-directory]]:mt-0 [&>[data-settings-directory]:first-child]:mt-0 [&>[data-settings-directory]:last-child]:mb-0"
>
	{@render children()}
</div>
