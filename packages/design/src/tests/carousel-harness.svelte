<script lang="ts">
	/**
	 * A carousel with its two controls and no `Carousel.Content`.
	 *
	 * Scaffolding rather than a test. Leaving the content out is not a shortcut: it applies the
	 * `embla-carousel-svelte` action, which measures a scroll container, and nothing under jsdom
	 * has a width. The root sets the context the controls read on its own, so the subject is
	 * intact and what is left out could only ever have been measured in a browser.
	 */
	import * as Carousel from '#lib/primitive/carousel/index.js';
</script>

<Carousel.Root>
	<Carousel.Previous />
	<Carousel.Next />
</Carousel.Root>
