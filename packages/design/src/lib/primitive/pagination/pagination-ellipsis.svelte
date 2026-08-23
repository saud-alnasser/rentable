<script lang="ts">
	import { useDesignContract } from '#lib/strings.js';
	import { cn, type WithElementRef, type WithoutChildren } from '#lib/tailwind.js';
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: WithoutChildren<WithElementRef<HTMLAttributes<HTMLSpanElement>>> = $props();

	const contract = useDesignContract();
</script>

<span
	bind:this={ref}
	aria-hidden="true"
	data-slot="pagination-ellipsis"
	class={cn('flex size-9 items-center justify-center', className)}
	{...restProps}
>
	<EllipsisIcon class="size-4" />
	<span class="sr-only">{contract.strings.morePages}</span>
</span>
