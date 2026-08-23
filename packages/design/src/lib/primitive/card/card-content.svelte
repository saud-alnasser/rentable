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
	data-slot="card-content"
	dir={contract.direction}
	class={cn('px-5 text-start', className)}
	{...restProps}
>
	{@render children?.()}
</div>
