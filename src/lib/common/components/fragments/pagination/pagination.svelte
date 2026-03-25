<script lang="ts">
	import { Pagination as PaginationPrimitive } from 'bits-ui';

	import { cn } from '$lib/common/utils/tailwind.js';
	import { LL } from '$lib/i18n/i18n-svelte';

	let {
		ref = $bindable(null),
		class: className,
		count = 0,
		perPage = 10,
		page = $bindable(1),
		siblingCount = 1,
		...restProps
	}: PaginationPrimitive.RootProps = $props();
</script>

<PaginationPrimitive.Root
	bind:ref
	bind:page
	role="navigation"
	aria-label={$LL.common.ui.pagination()}
	data-slot="pagination"
	class={cn('mx-auto flex w-full justify-center', className)}
	{count}
	{perPage}
	{siblingCount}
	{...restProps}
/>
