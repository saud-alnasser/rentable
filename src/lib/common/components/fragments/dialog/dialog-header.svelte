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
	data-slot="dialog-header"
	class={cn(
		'flex flex-col gap-2 border-b border-border/60 bg-muted/10 px-6 py-5 text-center sm:text-start',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>
