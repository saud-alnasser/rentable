<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import type api from '$lib/api/caller';
	import { COMPLEX_SORT_COLUMN_IDS, type ComplexSortColumnId } from '$lib/complex/complex';
	import { useListComplexes } from '$lib/complex/query';
	import List from '$lib/design/block/list.svelte';
	import * as Cell from '$lib/design/cell';
	import { hasCreateIntent } from '$lib/design/create-intent';
	import type { ListSort } from '$lib/design/sort';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { formatLocaleNumber } from '$lib/platform/locale';
	import CircleDashedIcon from '@tabler/icons-svelte/icons/circle-dashed';
	import CircleFilledIcon from '@tabler/icons-svelte/icons/circle-filled';
	import LayoutGridIcon from '@tabler/icons-svelte/icons/layout-grid';
	import ComplexForm from './form.svelte';

	type ComplexRecord = Awaited<ReturnType<typeof api.complex.getMany>>[number];

	// two lines of text and the breathing room around them; the shell lays rows out at this
	// height rather than measuring them.
	const ROW_HEIGHT = 64;

	let search = $state('');
	let sort = $state<ListSort | null>(null);
	let isComplexFormOpen = $state(false);

	const complexesQuery = useListComplexes(
		() => search,
		() => sort
	);
	const complexes = $derived(complexesQuery.data ?? []);

	// built from the ids the procedure orders by, so the control cannot come to offer a key
	// the query would reject. The record type is what makes a missing label a type error.
	const sortOptions = $derived.by(() => {
		const labels: Record<ComplexSortColumnId, string> = {
			name: $LL.common.labels.name(),
			location: $LL.common.labels.location(),
			unitCount: $LL.common.labels.units(),
			vacantUnitCount: $LL.common.labels.vacantUnits()
		};

		return COMPLEX_SORT_COLUMN_IDS.map((id) => ({ id, label: labels[id] }));
	});

	// the intent is consumed on arrival and cleared from the URL, so a reload or a back
	// navigation does not reopen a form the user has already dismissed.
	$effect(() => {
		if (!hasCreateIntent(page.url)) {
			return;
		}

		isComplexFormOpen = true;
		void goto(resolve('/complexes'), { replaceState: true, noScroll: true, keepFocus: true });
	});
</script>

<List
	data={complexes}
	bind:search
	bind:sort
	{sortOptions}
	isLoading={complexesQuery.isLoading}
	isFetching={complexesQuery.isFetching}
	recordHeight={ROW_HEIGHT}
	exportAs={{
		name: `${$LL.common.nav.complexes()}.csv`,
		columns: [
			{ header: $LL.common.labels.name(), value: (complex) => complex.name },
			{ header: $LL.common.labels.location(), value: (complex) => complex.location },
			{
				header: $LL.common.labels.units(),
				value: (complex) => formatLocaleNumber($locale, complex.unitCount)
			},
			{
				header: $LL.common.labels.vacantUnits(),
				value: (complex) => formatLocaleNumber($locale, complex.vacantUnitCount)
			}
		]
	}}
	onCreate={() => {
		isComplexFormOpen = true;
	}}
>
	{#snippet record(complex: ComplexRecord)}
		<!-- occupancy is not on the query: a unit is occupied or vacant, so the third figure is
		     the other two. -->
		{@const occupiedUnitCount = complex.unitCount - complex.vacantUnitCount}
		<a
			href={resolve(`/complexes/${complex.id}`)}
			class="flex h-full items-center gap-4 border-b px-4 transition-colors hover:bg-muted/40"
		>
			<span class="flex min-w-0 flex-1 flex-col gap-0.5 text-start">
				<span class="truncate text-sm font-medium">{complex.name}</span>
				<span class="truncate text-xs text-muted-foreground">{complex.location}</span>
			</span>

			<Cell.Count
				icon={LayoutGridIcon}
				count={complex.unitCount}
				label={$LL.common.labels.units()}
			/>

			<Cell.Count
				icon={CircleFilledIcon}
				count={occupiedUnitCount}
				label={$LL.common.labels.occupiedUnits()}
				tone={occupiedUnitCount > 0 ? 'running' : 'settled'}
			/>

			<Cell.Count
				icon={CircleDashedIcon}
				count={complex.vacantUnitCount}
				label={$LL.common.labels.vacantUnits()}
			/>
		</a>
	{/snippet}
</List>

<ComplexForm
	open={isComplexFormOpen}
	onOpenChange={(isOpen) => {
		isComplexFormOpen = isOpen;
	}}
	value={undefined}
/>
