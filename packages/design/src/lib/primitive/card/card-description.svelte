<script lang="ts">
	import { useDesignContract } from '#lib/strings.js';
	import { cn, type WithElementRef } from '#lib/tailwind.js';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLParagraphElement>> = $props();

	const contract = useDesignContract();
</script>

<p
	bind:this={ref}
	data-slot="card-description"
	dir={contract.direction}
	class={cn('text-start text-sm text-muted-foreground', className)}
	{...restProps}
>
	{@render children?.()}
</p>
