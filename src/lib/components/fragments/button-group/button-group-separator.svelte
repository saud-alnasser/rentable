<script lang="ts">
	import { Separator } from '$lib/components/fragments/separator/index.js';
	import { cn } from '$lib/utils/tailwind.js';
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
