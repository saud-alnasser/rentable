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
	import { CONTRACT_ATTENTION_ORDER } from '$lib/contract/contract';
	import TenantForm from './form.svelte';
	import { recordCard } from '$lib/design/block/list.svelte';
	import { cn } from '$lib/design/tailwind';

	type TenantRecord = Awaited<ReturnType<typeof api.tenant.getMany>>[number];

	// two lines of text and the breathing room around them; the shell lays rows out at this
	// height rather than measuring them.
	const ROW_HEIGHT = 64;

	// the row's six figures, keyed by the status each counts.
	//
	// The query answers with one field per status rather than a nested figure, so this is where
	// the two shapes meet — and it is a function of the record rather than a derived value
	// because the list hands each row to the snippet one at a time.
	const contractCounts = (tenant: TenantRecord) => ({
		scheduled: tenant.contractsScheduled,
		active: tenant.contractsActive,
		fulfilled: tenant.contractsFulfilled,
		defaulted: tenant.contractsDefaulted,
		expired: tenant.contractsExpired,
		terminated: tenant.contractsTerminated
	});

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
			// the export follows the row, because the columns are the row's: a reader exports what
			// they are looking at, and a file short of a figure that is on screen is the defect the
			// complexes export already has.
			...CONTRACT_ATTENTION_ORDER.map((status) => ({
				header: $LL.common.status[status](),
				value: (tenant: TenantRecord) => formatLocaleNumber($locale, contractCounts(tenant)[status])
			}))
		]
	}}
	onCreate={() => {
		isTenantFormOpen = true;
	}}
>
	{#snippet record(tenant: TenantRecord)}
		{@const counts = contractCounts(tenant)}
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

			<!-- a figure per status, in the order the contracts directory ranks them: what needs the
			     reader, then what is running, then what has not started, then the history behind
			     them. Every status is shown including the ones at zero, so the six form fixed
			     columns down the list — a cluster that varied with what each tenant happened to
			     hold would work against exactly that. -->
			<span class="flex shrink-0 items-center gap-3">
				{#each CONTRACT_ATTENTION_ORDER as status (status)}
					<Cell.StatusCount {status} count={counts[status]} />
				{/each}
			</span>
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
