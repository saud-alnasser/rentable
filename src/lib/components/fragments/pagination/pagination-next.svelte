<script lang="ts">
	import { buttonVariants } from '$lib/components/fragments/button/index.js';
	import { cn } from '$lib/utils/tailwind.js';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import { Pagination as PaginationPrimitive } from 'bits-ui';

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: PaginationPrimitive.NextButtonProps = $props();
</script>

<PaginationPrimitive.NextButton
	bind:ref
	aria-label="Go to next page"
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
	<span class="hidden sm:block">Next</span>
	<ChevronRightIcon /></PaginationPrimitive.NextButton
>
