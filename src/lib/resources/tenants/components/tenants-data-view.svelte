<script lang="ts">
	import { resolve } from '$app/paths';
	import type { Tenant } from '$lib/api/database/schema';
	import DataView from '$lib/common/components/blocks/data-view.svelte';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/common/components/fragments/card';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { localesMetadata } from '$lib/i18n/i18n-translations-util';
	import { useInfiniteTenants } from '$lib/resources/tenants/hooks/queries';
	import TenantForm from './tenant-form.svelte';

	let search = $state('');

	let isTenantFormOpen = $state(false);

	const fetchQuery = useInfiniteTenants(() => ({ search }));

	const getSearchValue = (record: Tenant) =>
		[record.name, record.phone, record.nationalId].filter(Boolean).join(' ');
	let tenants = $derived.by(
		() => fetchQuery.data?.pages.flatMap((page: { items: Tenant[] }) => page.items) ?? []
	);

	const getTenantInitials = (name: string) =>
		name
			.split(' ')
			.filter(Boolean)
			.slice(0, 2)
			.map((part) => part[0]?.toUpperCase() ?? '')
			.join('');
</script>

<DataView
	data={tenants}
	isLoading={fetchQuery.isLoading}
	isFetching={fetchQuery.isFetching}
	hasNextPage={fetchQuery.hasNextPage}
	isFetchingNextPage={fetchQuery.isFetchingNextPage}
	fetchNextPage={() => fetchQuery.fetchNextPage()}
	bind:searchValue={search}
	{getSearchValue}
	virtualItemHeight={220}
	onCreate={() => {
		isTenantFormOpen = true;
	}}
>
	{#snippet item(record: Tenant)}
		<a href={resolve(`/tenants/${record.id}`)} class="block">
			<Card
				class="gap-0 overflow-hidden border-border/70 bg-card/65 shadow-xl backdrop-blur-xl transition-transform duration-200 hover:-translate-y-0.5 hover:border-primary/35 hover:bg-card/78"
			>
				<CardHeader class="gap-3 border-b pb-4">
					<div class="flex min-w-0 items-center gap-3 rtl:flex-row-reverse">
						<div
							class="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary"
						>
							{getTenantInitials(record.name)}
						</div>
						<div class="min-w-0 space-y-1 text-start">
							<CardTitle class="truncate">{record.name}</CardTitle>
							<CardDescription class="truncate">{record.phone}</CardDescription>
						</div>
					</div>
				</CardHeader>
				<CardContent class="grid gap-3 pt-4 sm:grid-cols-2 xl:grid-cols-3 [&>*]:text-start">
					<div class="rounded-xl border border-border/60 bg-accent/30 p-4 backdrop-blur-sm">
						<p class="text-xs tracking-wide text-muted-foreground uppercase">
							{$LL.common.labels.nationalId()}
						</p>
						<p class="mt-2 text-sm font-medium">{record.nationalId}</p>
					</div>
					<div class="rounded-xl border border-border/60 bg-accent/30 p-4 backdrop-blur-sm">
						<p class="text-xs tracking-wide text-muted-foreground uppercase">
							{$LL.common.labels.phone()}
						</p>
						<p class="mt-2 text-sm font-medium" dir={localesMetadata[$locale].direction}>
							{record.phone}
						</p>
					</div>
				</CardContent>
			</Card>
		</a>
	{/snippet}
</DataView>

<TenantForm
	open={isTenantFormOpen}
	onOpenChange={(isOpen) => {
		isTenantFormOpen = isOpen;
	}}
	value={undefined}
/>
