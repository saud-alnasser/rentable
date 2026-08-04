<script lang="ts">
	import { resolve } from '$app/paths';
	import type { Complex } from '$lib/platform/database/schema';
	import DataView from '$lib/design/block/data-view.svelte';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/design/primitive/card';
	import { LL } from '$lib/i18n/i18n-svelte';
	import ComplexesTableUnitsCount from '$lib/complex/component/unit-count.svelte';
	import { useInfiniteComplexes } from '$lib/complex/query';
	import ComplexForm from './form.svelte';

	let search = $state('');

	let isComplexFormOpen = $state(false);

	const fetchQuery = useInfiniteComplexes(() => search);

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
		isComplexFormOpen = true;
	}}
>
	{#snippet item(record: Complex)}
		<a href={resolve(`/complexes/${record.id}`)} class="block">
			<Card class="gap-0 overflow-hidden">
				<CardHeader class="gap-4 border-b pb-4">
					<div class="space-y-1 text-start">
						<CardTitle>{record.name}</CardTitle>
						<CardDescription>{record.location}</CardDescription>
					</div>
				</CardHeader>
				<CardContent class="pt-4 [&>*]:text-start">
					<div class="rounded-xl border bg-muted p-4">
						<p class="text-xs tracking-wide text-muted-foreground uppercase">
							{$LL.common.labels.units()}
						</p>
						<div class="mt-2 text-2xl leading-none font-semibold">
							<ComplexesTableUnitsCount complexId={record.id} class="h-auto w-auto" />
						</div>
					</div>
				</CardContent>
			</Card>
		</a>
	{/snippet}
</DataView>

<ComplexForm
	open={isComplexFormOpen}
	onOpenChange={(isOpen) => {
		isComplexFormOpen = isOpen;
	}}
	value={undefined}
/>
