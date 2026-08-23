<script lang="ts">
	import { Separator } from '#lib/primitive/separator/index.js';
	import { cn } from '#lib/tailwind.js';
	import type { ComponentProps } from 'svelte';

	let {
		ref = $bindable(null),
		class: className,
		orientation = 'vertical',
		...restProps
	}: ComponentProps<typeof Separator> = $props();
</script>

<Separator
	bind:ref
	data-slot="button-group-separator"
	{orientation}
	class={cn('relative !m-0 self-stretch bg-input data-[orientation=vertical]:h-auto', className)}
	{...restProps}
/>
