<script lang="ts">
	import { useDesignContract } from '#lib/strings.js';
	import { buttonVariants } from '#lib/primitive/button/index.js';
	import { cn } from '#lib/tailwind.js';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import { Pagination as PaginationPrimitive } from 'bits-ui';

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: PaginationPrimitive.NextButtonProps = $props();

	const contract = useDesignContract();
</script>

<PaginationPrimitive.NextButton
	bind:ref
	aria-label={contract.strings.goToNextPage}
	class={cn(
		buttonVariants({
			size: 'default',
			variant: 'ghost',
			class: 'gap-1 px-2.5 sm:pe-2.5'
		}),
		className
	)}
	{...restProps}
>
	<span class="hidden sm:block">{contract.strings.next}</span>
	<ChevronRightIcon class="rtl:rotate-180" /></PaginationPrimitive.NextButton
>
