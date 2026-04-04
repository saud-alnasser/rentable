<script lang="ts">
	import { buttonVariants } from '$lib/common/components/fragments/button/index.js';
	import { cn } from '$lib/common/utils/tailwind.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import { Pagination as PaginationPrimitive } from 'bits-ui';

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: PaginationPrimitive.PrevButtonProps = $props();
</script>

<PaginationPrimitive.PrevButton
	bind:ref
	aria-label={$LL.common.table.goToPreviousPage()}
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
	<span class="hidden sm:block">{$LL.common.ui.previous()}</span></PaginationPrimitive.PrevButton
>
