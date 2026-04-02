<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import type { Complex } from '$lib/api/database/schema';
	import DataTableActionsDropdown from '$lib/common/components/blocks/data-table-actions-dropdown.svelte';
	import DataView from '$lib/common/components/blocks/data-view.svelte';
	import DeleteDialog from '$lib/common/components/blocks/delete-dialog.svelte';
	import {
		Card,
		CardAction,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/common/components/fragments/card';
	import { LL } from '$lib/i18n/i18n-svelte';
	import ComplexesTableUnitsCount from '$lib/resources/complexes/components/complexes-table-units-count.svelte';
	import { useDeleteComplex, useInfiniteComplexes } from '$lib/resources/complexes/hooks/queries';
	import ComplexForm from './complex-form.svelte';

	let search = $state('');

	const fetchQuery = useInfiniteComplexes(() => search);
	const deleteMutation = useDeleteComplex();

	let complex = $state<Complex | undefined>(undefined);
	let isComplexFormOpen = $state(false);
	let isDeleteDialogOpen = $state(false);

	const getSearchValue = (record: Complex) =>
		[record.name, record.location].filter(Boolean).join(' ');
	let complexes = $derived.by(
		() => fetchQuery.data?.pages.flatMap((page: { items: Complex[] }) => page.items) ?? []
	);
</script>

<DataView
	data={complexes}
	isLoading={fetchQuery.isLoading}
	isFetching={fetchQuery.isFetching}
	hasNextPage={fetchQuery.hasNextPage}
	isFetchingNextPage={fetchQuery.isFetchingNextPage}
	fetchNextPage={() => fetchQuery.fetchNextPage()}
	bind:searchValue={search}
	{getSearchValue}
	virtualItemHeight={260}
	onCreate={() => {
		complex = undefined;
		isComplexFormOpen = true;
	}}
>
	{#snippet item(record: Complex)}
		<Card class="gap-0 overflow-hidden">
			<CardHeader class="gap-4 border-b pb-4">
				<div class="space-y-1">
					<CardTitle>{record.name}</CardTitle>
					<CardDescription>{record.location}</CardDescription>
				</div>
				<CardAction>
					<DataTableActionsDropdown
						actions={[
							{
								label: $LL.complexes.units.management(),
								onclick: () => goto(resolve(`/complexes/units/${record.id}`))
							},
							{
								label: $LL.common.actions.edit(),
								onclick: () => {
									complex = record;
									isComplexFormOpen = true;
								}
							},
							{
								label: $LL.common.actions.delete(),
								onclick: () => {
									complex = record;
									isDeleteDialogOpen = true;
								}
							}
						]}
					/>
				</CardAction>
			</CardHeader>
			<CardContent class="grid gap-3 pt-4 sm:grid-cols-2">
				<div class="rounded-lg border bg-muted/10 p-4">
					<p class="text-xs tracking-wide text-muted-foreground uppercase">
						{$LL.common.labels.location()}
					</p>
					<p class="mt-2 text-sm font-medium">{record.location}</p>
				</div>
				<div class="rounded-lg border bg-muted/10 p-4">
					<p class="text-xs tracking-wide text-muted-foreground uppercase">
						{$LL.common.labels.units()}
					</p>
					<div class="mt-2 text-2xl leading-none font-semibold">
						<ComplexesTableUnitsCount complexId={record.id} class="h-auto w-auto" />
					</div>
				</div>
			</CardContent>
		</Card>
	{/snippet}
</DataView>

<ComplexForm
	open={isComplexFormOpen}
	onOpenChange={(isOpen) => {
		isComplexFormOpen = isOpen;
		if (!isOpen) complex = undefined;
	}}
	value={complex}
/>

<DeleteDialog
	open={isDeleteDialogOpen}
	onOpenChange={(isOpen) => {
		isDeleteDialogOpen = isOpen;
		if (!isOpen) complex = undefined;
	}}
	onSubmit={async () => {
		if (complex) {
			await deleteMutation.mutateAsync(complex.id);
		}
	}}
/>
