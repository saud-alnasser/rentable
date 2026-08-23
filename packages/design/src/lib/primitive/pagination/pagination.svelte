<script lang="ts">
	import { Pagination as PaginationPrimitive } from 'bits-ui';

	import { useDesignContract } from '#lib/strings.js';
	import { cn } from '#lib/tailwind.js';

	let {
		ref = $bindable(null),
		class: className,
		count = 0,
		perPage = 10,
		page = $bindable(1),
		siblingCount = 1,
		...restProps
	}: PaginationPrimitive.RootProps = $props();

	const contract = useDesignContract();
</script>

<PaginationPrimitive.Root
	bind:ref
	bind:page
	role="navigation"
	aria-label={contract.strings.pagination}
	data-slot="pagination"
	class={cn('mx-auto flex w-full justify-center', className)}
	{count}
	{perPage}
	{siblingCount}
	{...restProps}
/>
