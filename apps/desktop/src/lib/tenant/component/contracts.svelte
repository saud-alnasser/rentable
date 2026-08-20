<script lang="ts">
	import type api from '$lib/api/caller';
	import List from '$lib/design/block/list.svelte';
	import type { ListSort } from '$lib/design/sort';
	import ContractActions from '$lib/contract/component/actions.svelte';
	import ContractRecord from '$lib/contract/component/record.svelte';
	import ContractSelectionActions from '$lib/contract/component/selection-actions.svelte';
	import { CONTRACT_SORT_COLUMN_IDS, type ContractSortColumnId } from '$lib/contract/contract';
	import { RANK_FILTER, toChosenRank } from '$lib/contract/rank-filter';
	import { useListContracts } from '$lib/contract/query';
	import type { FilterSelection } from '$lib/design/filter';
	import { LL } from '$lib/i18n/i18n-svelte';

	/** The tenant whose contracts these are. */
	let { tenantId }: { tenantId: string } = $props();

	type ContractRow = Awaited<ReturnType<typeof api.contract.getMany>>[number];

	const ROW_HEIGHT = 64;

	let search = $state('');
	let sort = $state<ListSort | null>(null);
	let filters = $state<FilterSelection>({});
	let selected = $state<string[]>([]);

	// the same rank the directory offers: a tenant holding several contracts is exactly where
	// *which of these needs attention* is asked, and it was the one question this list could not
	// answer.
	const rank = $derived(toChosenRank(filters));

	const contractsQuery = useListContracts(
		() => search,
		() => sort,
		() => (rank ? { tenantId, rank } : { tenantId })
	);
	const contracts = $derived(contractsQuery.data ?? []);

	// the same keys the directory offers, less the tenant: every contract here is held by one
	// person, so ordering by their name would order by a column that does not vary.
	const sortOptions = $derived.by(() => {
		const labels: Record<ContractSortColumnId, string> = {
			tenantName: $LL.common.labels.tenant(),
			govId: $LL.common.labels.contractNumber(),
			start: $LL.common.labels.start(),
			end: $LL.common.labels.end(),
			cost: $LL.common.labels.costPerPayment(),
			status: $LL.common.labels.status()
		};

		return CONTRACT_SORT_COLUMN_IDS.filter((id) => id !== 'tenantName').map((id) => ({
			id,
			label: labels[id]
		}));
	});
</script>

<ContractActions>
	{#snippet children(contractActions)}
		<ContractSelectionActions onActed={() => (selected = [])}>
			{#snippet children(selectionActions)}
				<List
					data={contracts}
					bind:search
					bind:sort
					{sortOptions}
					bind:filters
					filterOptions={[RANK_FILTER]}
					bind:selected
					{selectionActions}
					isLoading={contractsQuery.isLoading}
					isFetching={contractsQuery.isFetching}
					recordHeight={ROW_HEIGHT}
					emptyTitle={$LL.tenants.contracts.emptyTitle()}
					emptyDescription={$LL.tenants.contracts.emptyDescription()}
				>
					{#snippet record(contract: ContractRow)}
						<ContractRecord {contract} actions={contractActions.of(contract)} />
					{/snippet}
				</List>
			{/snippet}
		</ContractSelectionActions>
	{/snippet}
</ContractActions>
