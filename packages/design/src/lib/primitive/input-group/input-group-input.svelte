<script lang="ts">
	import { Input } from '#lib/primitive/input/index.js';
	import { cn } from '#lib/tailwind.js';
	import type { ComponentProps } from 'svelte';

	let {
		ref = $bindable(null),
		value = $bindable(),
		class: className,
		...props
	}: ComponentProps<typeof Input> = $props();
</script>

<Input
	bind:ref
	data-slot="input-group-control"
	class={cn(
		// `h-full` rather than the input's own `h-8`: the group is the `h-8` box now and carries
		// the border, so an input keeping its own height would overflow it by the border's width.
		'h-full flex-1 rounded-none border-0 bg-transparent shadow-none hover:bg-transparent focus-visible:ring-0',
		className
	)}
	bind:value
	{...props}
/>
