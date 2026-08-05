<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import type { Contract } from '$lib/platform/database/schema';
	import type api from '$lib/api/caller';
	import * as Cell from '$lib/design/cell';
	import { hasCreateIntent } from '$lib/design/create-intent';
	import List from '$lib/design/block/list.svelte';
	import type { ListSort } from '$lib/design/sort';
	import { CONTRACT_SORT_COLUMN_IDS, type ContractSortColumnId } from '$lib/contract/contract';
	import { useListContracts } from '$lib/contract/query';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { untrack } from 'svelte';
	import ContractForm from './form.svelte';

	type ContractRecord = Awaited<ReturnType<typeof api.contract.getMany>>[number];

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

	const intervalLabels = $derived<Record<Contract['interval'], string>>({
		'1m': $LL.contracts.intervals.monthly(),
		'3m': $LL.contracts.intervals.quarterly(),
		'6m': $LL.contracts.intervals.semiAnnual(),
		'12m': $LL.contracts.intervals.annual()
	});

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
	{#snippet record(contract: ContractRecord)}
		<a
			href={resolve(`/contracts/${contract.id}`)}
			class="flex h-full items-center gap-3 border-b px-4 transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 active:bg-muted/60"
		>
			<span class="flex min-w-0 flex-1 flex-col gap-0.5 text-start">
				<span class="truncate text-sm font-medium">
					{contract.tenantName?.trim() || $LL.common.labels.tenant()}
				</span>
				<span class="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
					<span class="truncate tabular-nums">{contract.govId.trim() || '—'}</span>
					<span aria-hidden="true">&middot;</span>
					<!-- a range rather than "start → end": an arrow does not mirror in Arabic, where
					     the two dates swap and it would then point at the wrong one. -->
					<span class="truncate tabular-nums">
						<Cell.Date value={contract.start} /> – <Cell.Date value={contract.end} />
					</span>
				</span>
			</span>

			<span class="flex shrink-0 items-center gap-3">
				<Cell.Status status={contract.status} />
				<!-- the interval rides with the figure because a bare amount beside a contract
				     reads as what the contract is worth, and the cost is per interval. -->
				<span class="flex flex-col items-end gap-0.5 text-end text-sm">
					<Cell.Money amount={contract.cost} />
					<span class="text-xs text-muted-foreground">{intervalLabels[contract.interval]}</span>
				</span>
			</span>
		</a>
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
