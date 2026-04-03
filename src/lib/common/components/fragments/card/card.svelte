<script lang="ts">
	import { cn, type WithElementRef } from '$lib/common/utils/tailwind.js';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();
</script>

<div
	bind:this={ref}
	data-slot="card"
	class={cn(
		'flex flex-col gap-6 rounded-[1.5rem] border border-border/65 bg-card/72 py-6 text-card-foreground shadow-lg backdrop-blur-lg',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>
