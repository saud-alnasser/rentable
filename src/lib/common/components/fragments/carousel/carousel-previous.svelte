<script lang="ts">
	import { Button, type Props } from '$lib/common/components/fragments/button/index.js';
	import { cn } from '$lib/common/utils/tailwind.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import type { WithoutChildren } from 'bits-ui';
	import { getEmblaContext } from './context.js';

	let {
		ref = $bindable(null),
		class: className,
		variant = 'outline',
		size = 'icon',
		...restProps
	}: WithoutChildren<Props> = $props();

	const emblaCtx = getEmblaContext('<Carousel.Previous/>');
</script>

<Button
	data-slot="carousel-previous"
	{variant}
	{size}
	aria-disabled={!emblaCtx.canScrollPrev}
	class={cn(
		'absolute size-8 rounded-full',
		emblaCtx.orientation === 'horizontal'
			? '-start-12 top-1/2 -translate-y-1/2'
			: 'start-1/2 -top-12 -translate-x-1/2 rotate-90',
		className
	)}
	onclick={emblaCtx.scrollPrev}
	onkeydown={emblaCtx.handleKeyDown}
	{...restProps}
	bind:ref
>
	<ArrowLeftIcon class="size-4" />
	<span class="sr-only">{$LL.common.ui.previousSlide()}</span>
</Button>
