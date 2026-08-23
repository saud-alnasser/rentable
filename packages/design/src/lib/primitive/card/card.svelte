<script lang="ts">
	import { useDesignContract } from '#lib/strings.js';
	import { cn, type WithElementRef } from '#lib/tailwind.js';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();

	const contract = useDesignContract();
</script>

<div
	bind:this={ref}
	data-slot="card"
	dir={contract.direction}
	class={cn(
		'flex flex-col gap-5 rounded-3xl bg-card py-5 text-start text-sm text-card-foreground shadow-sm ring-1 ring-foreground/10',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>
