<script lang="ts">
	import { buttonVariants } from '$lib/common/components/fragments/button/index.js';
	import { cn } from '$lib/common/utils/tailwind.js';
	import { LL } from '$lib/i18n/i18n-svelte';
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
	aria-label={$LL.common.table.goToNextPage()}
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
	<span class="hidden sm:block">{$LL.common.ui.next()}</span>
	<ChevronRightIcon /></PaginationPrimitive.NextButton
>
