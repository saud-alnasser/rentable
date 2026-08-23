<script lang="ts">
	import { useDesignContract } from '#lib/strings.js';
	import { buttonVariants } from '#lib/primitive/button/index.js';
	import { cn } from '#lib/tailwind.js';
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import { Pagination as PaginationPrimitive } from 'bits-ui';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: PaginationPrimitive.PrevButtonProps = $props();

	const contract = useDesignContract();
</script>

{#snippet Fallback()}
	<ChevronLeftIcon class="size-4 rtl:rotate-180" />
	<span>{contract.strings.previous}</span>
{/snippet}

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
	children={children || Fallback}
	{...restProps}
/>
