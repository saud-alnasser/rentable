<script lang="ts">
	import { cn, type WithElementRef } from '$lib/common/utils/tailwind.js';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		inset,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		inset?: boolean;
	} = $props();
</script>

<div
	bind:this={ref}
	data-slot="dropdown-menu-label"
	data-inset={inset}
	class={cn(
		'px-2.5 py-2 text-[0.72rem] font-semibold tracking-[0.18em] text-muted-foreground uppercase data-[inset]:ps-9',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>
