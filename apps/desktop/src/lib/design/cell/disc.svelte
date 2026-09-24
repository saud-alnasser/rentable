<script lang="ts">
	import CircleIcon from '@lucide/svelte/icons/circle';
	import { cn } from '@rentable/design/tailwind.js';
	import type { ComponentProps } from 'svelte';

	/**
	 * A solid disc: lucide's circle with its fill on.
	 *
	 * Lucide draws outlines and has no filled glyph of its own, so the one filled mark this
	 * application reads by is the outline filled in its own colour. It takes every prop a lucide
	 * glyph takes and stands wherever one is expected, which is what lets the status vocabulary
	 * and the count cell hold it beside the outlines they hold.
	 */
	let { class: className, ...rest }: ComponentProps<typeof CircleIcon> = $props();
</script>

<CircleIcon class={cn('fill-current', className)} {...rest} />
