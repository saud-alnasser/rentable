<script lang="ts">
	import { useDesignContract } from '#lib/strings.js';
	import { cn } from '#lib/tailwind.js';
	import { Slider as SliderPrimitive } from 'bits-ui';

	/**
	 * A slider with one thumb, over a run of steps.
	 *
	 * **The start is where the line starts**, so in Arabic the track fills from the right and the
	 * thumb sits further left the higher the value ([[rules/frontend]], *i18n*: sliders are on the
	 * mirror list). bits-ui places the thumb and the range from a direction it is handed rather than
	 * reads, so the document's direction is handed to it from `DesignProvider`, as the floating
	 * contents are; the arrow keys follow it, the one pointing toward the end stepping up.
	 *
	 * **The thumb is the control a reader reaches**, so what names it and what it says it is set to
	 * ride on the thumb: `thumbLabelledby` or `thumbLabel` names it, and `valueText` says the value
	 * as the reader would, where the bare number would be read out otherwise.
	 */
	let {
		ref = $bindable(null),
		class: className,
		value = $bindable(0),
		thumbLabel,
		thumbLabelledby,
		valueText,
		...restProps
	}: Omit<
		Extract<SliderPrimitive.RootProps, { type: 'single' }>,
		'type' | 'dir' | 'child' | 'children'
	> & {
		/** the thumb's accessible name, where no visible label names it. */
		thumbLabel?: string;
		/** the id of the visible label that names the thumb. */
		thumbLabelledby?: string;
		/** the value as words, read out in place of the number. */
		valueText?: string;
	} = $props();

	const contract = useDesignContract();
</script>

<SliderPrimitive.Root
	bind:ref
	bind:value
	type="single"
	dir={contract.direction}
	data-slot="slider"
	class={cn(
		'relative flex w-full touch-none items-center select-none data-[disabled]:opacity-50',
		className
	)}
	{...restProps}
>
	<span
		data-slot="slider-track"
		class="relative h-1.5 w-full grow overflow-hidden rounded-full bg-muted"
	>
		<SliderPrimitive.Range data-slot="slider-range" class="absolute h-full bg-primary" />
	</span>
	<SliderPrimitive.Thumb
		index={0}
		data-slot="slider-thumb"
		class="shadow-sm block size-4 shrink-0 rounded-full border border-primary bg-background ring-ring/50 transition-[color,box-shadow] outline-none hover:ring-4 focus-visible:ring-4 data-[disabled]:pointer-events-none"
		aria-label={thumbLabel}
		aria-labelledby={thumbLabelledby}
		aria-valuetext={valueText}
	/>
</SliderPrimitive.Root>
