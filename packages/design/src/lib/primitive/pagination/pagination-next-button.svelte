<script lang="ts">
	import { useDesignContract } from '#lib/strings.js';
	import { buttonVariants } from '#lib/primitive/button/index.js';
	import { cn } from '#lib/tailwind.js';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import { Pagination as PaginationPrimitive } from 'bits-ui';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: PaginationPrimitive.NextButtonProps = $props();

	const contract = useDesignContract();
</script>

{#snippet Fallback()}
	<span>{contract.strings.next}</span>
	<ChevronRightIcon class="size-4 rtl:rotate-180" />
{/snippet}

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
	children={children || Fallback}
	{...restProps}
/>
