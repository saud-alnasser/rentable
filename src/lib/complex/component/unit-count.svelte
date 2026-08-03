<script lang="ts">
	import { Skeleton } from '$lib/design/primitive/skeleton';
	import { cn } from '$lib/design/tailwind';
	import { useFetchUnits } from '$lib/complex/query';
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
