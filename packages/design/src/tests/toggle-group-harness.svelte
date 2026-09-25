<script lang="ts">
	/**
	 * A segmented control of two, each segment asked to share the row as the member sheets ask.
	 *
	 * Scaffolding rather than a test. An item reads the variant, the size and the spacing from the
	 * context its root sets, so it cannot be rendered on its own; `class` is handed to both items
	 * so a test can see what a caller's classes do against the item's own.
	 */
	import * as ToggleGroup from '#lib/primitive/toggle-group/index.js';

	let { class: className = '' }: { class?: string } = $props();
</script>

<ToggleGroup.Root type="single" variant="outline" value="member">
	<ToggleGroup.Item value="member" class={className}>member</ToggleGroup.Item>
	<ToggleGroup.Item value="manager" class={className}>manager</ToggleGroup.Item>
</ToggleGroup.Root>
