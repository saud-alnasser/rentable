<script lang="ts">
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';

	/**
	 * The arrow a corner back control carries, mirrored for a reader going right to left.
	 *
	 * `SurfaceAction` takes a glyph as a component and sets the glyph's class itself, so the one
	 * class the arrow needs beyond that, `rtl:rotate-180`, has nowhere to go but a glyph that
	 * already carries it. The design package is read and not changed for this: a slot on the
	 * block for one consumer's class is how blocks grow shapes nobody argued for. The package's
	 * own `back-control` mirrors the same arrow the same way.
	 */
	let { class: className }: { class?: string } = $props();
</script>

<ArrowLeftIcon class="{className ?? ''} rtl:rotate-180" />
