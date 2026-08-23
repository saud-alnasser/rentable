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
	data-slot="card-title"
	dir={contract.direction}
	class={cn('text-start text-base leading-none font-semibold', className)}
	{...restProps}
>
	{@render children?.()}
</div>
