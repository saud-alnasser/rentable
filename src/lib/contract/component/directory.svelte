<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import type api from '$lib/api/caller';
	import { hasCreateIntent } from '$lib/design/create-intent';
	import List from '$lib/design/block/list.svelte';
	import type { ListSort } from '$lib/design/sort';
	import { CONTRACT_SORT_COLUMN_IDS, type ContractSortColumnId } from '$lib/contract/contract';
	import { useListContracts } from '$lib/contract/query';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { untrack } from 'svelte';
	import ContractForm from './form.svelte';
	import ContractRecord from './record.svelte';

	type ContractRow = Awaited<ReturnType<typeof api.contract.getMany>>[number];

	// two lines of text and the breathing room around them; the shell lays rows out at this
	// height rather than measuring them.
	const ROW_HEIGHT = 64;

	let search = $state('');
	let sort = $state<ListSort | null>(null);
	let isContractFormOpen = $state(false);
	let contractFormRenderKey = $state(0);

	const contractsQuery = useListContracts(
		() => search,
		() => sort
	);
	const contracts = $derived(contractsQuery.data ?? []);

	// built from the ids the procedure orders by, so the control cannot come to offer a key
	// the query would reject. The record type is what makes a missing label a type error.
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

	const openCreateContractForm = () => {
		contractFormRenderKey += 1;
		isContractFormOpen = true;
	};

	// the intent is consumed on arrival and cleared from the URL, so a reload or a back
	// navigation does not reopen a form the user has already dismissed. opening is untracked
	// because it advances the render key by reading it, and an effect that reads what it
	// writes never settles.
	$effect(() => {
		if (!hasCreateIntent(page.url)) {
			return;
		}

		untrack(openCreateContractForm);
		void goto(resolve('/contracts'), { replaceState: true, noScroll: true, keepFocus: true });
	});
</script>

<List
	data={contracts}
	bind:search
	bind:sort
	{sortOptions}
	isLoading={contractsQuery.isLoading}
	isFetching={contractsQuery.isFetching}
	recordHeight={ROW_HEIGHT}
	onCreate={openCreateContractForm}
>
	{#snippet record(contract: ContractRow)}
		<ContractRecord {contract} />
	{/snippet}
</List>

{#key contractFormRenderKey}
	<ContractForm
		open={isContractFormOpen}
		onOpenChange={(isOpen) => {
			if (!isOpen) {
				contractFormRenderKey += 1;
			}

			isContractFormOpen = isOpen;
		}}
		value={undefined}
	/>
{/key}
