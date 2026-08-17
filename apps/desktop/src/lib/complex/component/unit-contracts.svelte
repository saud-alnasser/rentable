<script lang="ts">
	import type api from '$lib/api/caller';
	import List from '$lib/design/block/list.svelte';
	import type { ListSort } from '$lib/design/sort';
	import ContractActions from '$lib/contract/component/actions.svelte';
	import ContractRecord from '$lib/contract/component/record.svelte';
	import { CONTRACT_SORT_COLUMN_IDS, type ContractSortColumnId } from '$lib/contract/contract';
	import { useListContracts } from '$lib/contract/query';
	import { LL } from '$lib/i18n/i18n-svelte';

	/** The unit these contracts mention. */
	let { unitId }: { unitId: number } = $props();

	type ContractRow = Awaited<ReturnType<typeof api.contract.getMany>>[number];

	const ROW_HEIGHT = 64;

	let search = $state('');
	let sort = $state<ListSort | null>(null);

	const contractsQuery = useListContracts(
		() => search,
		() => sort,
		() => ({ unitId })
	);
	const contracts = $derived(contractsQuery.data ?? []);

	// every sort key the directory offers: a unit's contracts are held by different tenants
	// over different periods, so none of them is constant here the way a tenant's name is on
	// that tenant's own profile.
	const sortOptions = $derived.by(() => {
		const labels: Record<ContractSortColumnId, string> = {
			tenantName: $LL.common.labels.tenant(),
			govId: $LL.common.labels.contractNumber(),
			start: $LL.common.labels.start(),
			end: $LL.common.labels.end(),
			cost: $LL.common.labels.costPerPayment(),
			status: $LL.common.labels.status()
		};

		return CONTRACT_SORT_COLUMN_IDS.map((id) => ({ id, label: labels[id] }));
	});
</script>

<ContractActions>
	{#snippet children(contractActions)}
		<List
			data={contracts}
			bind:search
			bind:sort
			{sortOptions}
			isLoading={contractsQuery.isLoading}
			isFetching={contractsQuery.isFetching}
			recordHeight={ROW_HEIGHT}
			emptyTitle={$LL.complexes.units.contractsEmptyTitle()}
			emptyDescription={$LL.complexes.units.contractsEmptyDescription()}
		>
			{#snippet record(contract: ContractRow)}
				<ContractRecord {contract} actions={contractActions.of(contract)} />
			{/snippet}
		</List>
	{/snippet}
</ContractActions>
