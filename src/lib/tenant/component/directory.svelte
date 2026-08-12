<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import type api from '$lib/api/caller';
	import List from '$lib/design/block/list.svelte';
	import * as Cell from '$lib/design/cell';
	import { hasCreateIntent } from '$lib/design/create-intent';
	import type { ListSort } from '$lib/design/sort';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { formatLocaleNumber } from '$lib/platform/locale';
	import { useListTenants } from '$lib/tenant/query';
	import { TENANT_SORT_COLUMN_IDS, type TenantSortColumnId } from '$lib/tenant/tenant';
	import ContractIcon from '@tabler/icons-svelte/icons/contract';
	import TenantForm from './form.svelte';
	import { recordCard } from '$lib/design/block/list.svelte';
	import { cn } from '$lib/design/tailwind';

	type TenantRecord = Awaited<ReturnType<typeof api.tenant.getMany>>[number];

	// two lines of text and the breathing room around them; the shell lays rows out at this
	// height rather than measuring them.
	const ROW_HEIGHT = 64;

	let search = $state('');
	let sort = $state<ListSort | null>(null);
	let isTenantFormOpen = $state(false);

	const tenantsQuery = useListTenants(
		() => search,
		() => sort
	);
	const tenants = $derived(tenantsQuery.data ?? []);

	// built from the ids the procedure orders by, so the control cannot come to offer a key
	// the query would reject. The record type is what makes a missing label a type error.
	const sortOptions = $derived.by(() => {
		const labels: Record<TenantSortColumnId, string> = {
			name: $LL.common.labels.name(),
			nationalId: $LL.common.labels.nationalId(),
			activeContractCount: $LL.common.labels.activeContracts()
		};

		return TENANT_SORT_COLUMN_IDS.map((id) => ({ id, label: labels[id] }));
	});

	// the intent is consumed on arrival and cleared from the URL, so a reload or a back
	// navigation does not reopen a form the user has already dismissed.
	$effect(() => {
		if (!hasCreateIntent(page.url)) {
			return;
		}

		isTenantFormOpen = true;
		void goto(resolve('/tenants'), { replaceState: true, noScroll: true, keepFocus: true });
	});
</script>

<List
	data={tenants}
	bind:search
	bind:sort
	{sortOptions}
	isLoading={tenantsQuery.isLoading}
	isFetching={tenantsQuery.isFetching}
	recordHeight={ROW_HEIGHT}
	exportAs={{
		name: `${$LL.common.nav.tenants()}.csv`,
		columns: [
			{ header: $LL.common.labels.name(), value: (tenant) => tenant.name },
			{ header: $LL.common.labels.nationalId(), value: (tenant) => tenant.nationalId },
			{ header: $LL.common.labels.phone(), value: (tenant) => tenant.phone },
			{
				header: $LL.common.labels.activeContracts(),
				value: (tenant) => formatLocaleNumber($locale, tenant.activeContractCount)
			}
		]
	}}
	onCreate={() => {
		isTenantFormOpen = true;
	}}
>
	{#snippet record(tenant: TenantRecord)}
		<a
			href={resolve(`/tenants/${tenant.id}`)}
			class={cn('flex h-full items-center gap-4 px-4 hover:bg-muted/40', recordCard)}
		>
			<span class="flex min-w-0 flex-1 flex-col gap-0.5 text-start">
				<span class="truncate text-sm font-medium">{tenant.name}</span>
				<span class="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
					<span class="truncate tabular-nums">{tenant.nationalId}</span>
					<span aria-hidden="true">&middot;</span>
					<Cell.Phone phone={tenant.phone} />
				</span>
			</span>

			<Cell.Count
				icon={ContractIcon}
				count={tenant.activeContractCount}
				label={$LL.common.labels.activeContracts()}
				tone={tenant.activeContractCount > 0 ? 'running' : 'settled'}
			/>
		</a>
	{/snippet}
</List>

<TenantForm
	open={isTenantFormOpen}
	onOpenChange={(isOpen) => {
		isTenantFormOpen = isOpen;
	}}
	value={undefined}
/>
