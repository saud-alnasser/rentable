<script lang="ts">
	import { cn, type WithoutChildrenOrChild } from '#lib/tailwind.js';
	import { Progress as ProgressPrimitive } from 'bits-ui';

	let {
		ref = $bindable(null),
		class: className,
		max = 100,
		value,
		...restProps
	}: WithoutChildrenOrChild<ProgressPrimitive.RootProps> = $props();

	const filledPercent = $derived(Math.min(Math.max(((value ?? 0) / (max || 1)) * 100, 0), 100));
</script>

<ProgressPrimitive.Root
	bind:ref
	data-slot="progress"
	class={cn('relative h-2 w-full overflow-hidden rounded-2xl bg-primary/20', className)}
	{value}
	{max}
	{...restProps}
>
	<!-- width rather than a translate: a transform is physical, so a translated indicator
	fills from the left in Arabic, against the direction the track is read in. -->
	<div
		data-slot="progress-indicator"
		class="h-full bg-primary transition-all"
		style="width: {filledPercent}%"
	></div>
</ProgressPrimitive.Root>
