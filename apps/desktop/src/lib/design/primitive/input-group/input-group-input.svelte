<script lang="ts">
	import { Input } from '$lib/design/primitive/input/index.js';
	import { cn } from '$lib/design/tailwind.js';
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
		'flex-1 rounded-none border-0 bg-transparent shadow-none hover:bg-transparent focus-visible:ring-0',
		className
	)}
	bind:value
	{...props}
/>
