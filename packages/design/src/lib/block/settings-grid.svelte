<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * A settings section's cards, laid in a grid rather than one linear column (effort 846,
	 * requirement 1, at the human's word of 2026-10-02: "maybe they are cards and section of
	 * grids").
	 *
	 * **Two columns where the section is wide enough for two cards of 340 pixels and the gap
	 * between them, one where it is not**, read off the section's own width with a container query
	 * rather than the window's, so the grid answers to the room it is given and not to whatever
	 * stands beside it. A card that says `span="full"` (`settings-group.svelte`) takes both.
	 *
	 * **Each card keeps its own height** (`items-start`): a short card beside a tall one does not
	 * stretch to meet it, so its edge says where it ends.
	 *
	 * **Reading order is source order, and the grid never reorders it.** A masonry layout would
	 * pack the cards tighter by moving them, and then what a keyboard and a screen reader meet
	 * would differ from what the eye sees. The cards that end something are written last, so they
	 * are drawn last.
	 *
	 * **A directory stands further from its neighbours than a card does** (`data-settings-directory`):
	 * its heading, its bar and its record cards sit 12 pixels apart, so the space around it is
	 * made larger than that, or its heading would read as the foot of the cards above it (*Avoid
	 * ambiguous spacing*).
	 *
	 * **The content is capped near 1100 pixels**, where a settings pane stops growing (Microsoft's
	 * guidance, about 1000 to 1100), so two cards side by side never become two strips across a
	 * wide window (*You don't have to fill the whole screen*).
	 */
	let { children }: { children: Snippet } = $props();
</script>

<div class="@container w-full max-w-[1100px]">
	<div
		data-settings-grid
		class="grid grid-cols-1 items-start gap-4 @min-[696px]:grid-cols-2 [&>[data-settings-directory]]:my-4 [&>[data-settings-directory]+[data-settings-directory]]:mt-0 [&>[data-settings-directory]:first-child]:mt-0 [&>[data-settings-directory]:last-child]:mb-0"
	>
		{@render children()}
	</div>
</div>
