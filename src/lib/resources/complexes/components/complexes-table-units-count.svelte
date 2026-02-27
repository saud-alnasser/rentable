<script lang="ts">
	import { Skeleton } from '$lib/common/components/fragments/skeleton';
	import { cn } from '$lib/common/utils/tailwind';
	import { useFetchUnits } from '$lib/resources/units/hooks/queries';
	import type { HTMLAttributes } from 'svelte/elements';

	type DataTableAsyncCellProps = {
		complexId: number;
	} & HTMLAttributes<HTMLParagraphElement>;

	let { complexId, class: className, ...restProps }: DataTableAsyncCellProps = $props();

	const query = useFetchUnits(() => complexId);
</script>

{#if query.isLoading}
	<Skeleton class={cn('h-5 w-2.5', className)} {...restProps} />
{:else}
	<div class={cn('h-5 w-2.5', className)} {...restProps}>{query.data?.length ?? 0}</div>
{/if}
