<script lang="ts">
	import { useDesignContract } from '#lib/strings.js';
	import { buttonVariants } from '#lib/primitive/button/index.js';
	import { cn } from '#lib/tailwind.js';
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import { Pagination as PaginationPrimitive } from 'bits-ui';

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: PaginationPrimitive.PrevButtonProps = $props();

	const contract = useDesignContract();
</script>

<PaginationPrimitive.PrevButton
	bind:ref
	aria-label={contract.strings.goToPreviousPage}
	class={cn(
		buttonVariants({
			size: 'default',
			variant: 'ghost',
			class: 'gap-1 px-2.5 sm:ps-2.5'
		}),
		className
	)}
	{...restProps}
>
	<ChevronLeftIcon class="rtl:rotate-180" />
	<span class="hidden sm:block">{contract.strings.previous}</span></PaginationPrimitive.PrevButton
>
