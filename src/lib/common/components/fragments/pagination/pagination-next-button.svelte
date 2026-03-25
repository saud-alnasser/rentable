<script lang="ts">
	import { buttonVariants } from '$lib/common/components/fragments/button/index.js';
	import { cn } from '$lib/common/utils/tailwind.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import { Pagination as PaginationPrimitive } from 'bits-ui';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: PaginationPrimitive.NextButtonProps = $props();
</script>

{#snippet Fallback()}
	<span>{$LL.common.ui.next()}</span>
	<ChevronRightIcon class="size-4" />
{/snippet}

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
	children={children || Fallback}
	{...restProps}
/>
