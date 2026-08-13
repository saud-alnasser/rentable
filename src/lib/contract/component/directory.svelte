<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import type api from '$lib/api/caller';
	import { hasCreateIntent } from '$lib/design/create-intent';
	import List from '$lib/design/block/list.svelte';
	import type { ListSort } from '$lib/design/sort';
	import { CONTRACT_SORT_COLUMN_IDS, type ContractSortColumnId } from '$lib/contract/contract';
	import { CONTRACT_RANKS, type ContractRank } from '$lib/contract/rank';
	import { readContractRank } from '$lib/contract/rank-filter';
	import { useListContracts } from '$lib/contract/query';
	import { Button } from '$lib/design/primitive/button';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { formatRecordDate } from '$lib/design/date';
	import { formatLocaleNumber, formatLocaleRangeWithUnit } from '$lib/platform/locale';
	import ContractActions from './actions.svelte';
	import ContractRecord from './record.svelte';

	type ContractRow = Awaited<ReturnType<typeof api.contract.getMany>>[number];

	// two lines of text and the breathing room around them; the shell lays rows out at this
	// height rather than measuring them.
	const ROW_HEIGHT = 64;

	let search = $state('');
	let sort = $state<ListSort | null>(null);
	let rank = $state<ContractRank | null>(null);

	const contractsQuery = useListContracts(
		() => search,
		() => sort,
		() => (rank ? { rank } : {})
	);

	const rankLabels = $derived<Record<ContractRank, string>>({
		overdue: $LL.contracts.ranks.overdue(),
		owing: $LL.contracts.ranks.owing(),
		'ending-soon': $LL.contracts.ranks.endingSoon()
	});
	const contracts = $derived(contractsQuery.data ?? []);

	// the same rendering the row shows, so the file reads as the screen does.
	const formatDate = (value: number) => formatRecordDate($locale, value);

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

	// the intent is consumed on arrival and cleared from the URL, so a reload or a back
	// navigation does not reopen a form the user has already dismissed.
	const clearCreateIntent = () =>
		void goto(resolve('/contracts'), { replaceState: true, noScroll: true, keepFocus: true });

	// a rank arrives in the URL from a surface that ranked a contract and sent the reader here
	// for the rest of that rank (ADR 0031). It is applied and cleared from the URL on arrival,
	// exactly as the create intent is: the narrowing is the reader's to change from the control
	// afterwards, and a reload should not put back one they have since cleared.
	$effect(() => {
		const requested = readContractRank(page.url);

		if (!requested) {
			return;
		}

		rank = requested;
		void goto(resolve('/contracts'), { replaceState: true, noScroll: true, keepFocus: true });
	});
</script>

{#snippet rankFilter()}
	<!-- pressing the chosen rank again clears it, so the control needs no separate "all" and
	     the set of ranks is the whole vocabulary on screen. -->
	<div class="flex items-center gap-1">
		{#each CONTRACT_RANKS as option (option)}
			<Button
				variant={rank === option ? 'default' : 'outline'}
				size="sm"
				aria-pressed={rank === option}
				onclick={() => (rank = rank === option ? null : option)}
			>
				{rankLabels[option]}
			</Button>
		{/each}
	</div>
{/snippet}

<ContractActions
	createRequested={hasCreateIntent(page.url)}
	onCreateRequestConsumed={clearCreateIntent}
>
	{#snippet children(contractActions)}
		<List
			data={contracts}
			bind:search
			bind:sort
			{sortOptions}
			filters={rankFilter}
			isLoading={contractsQuery.isLoading}
			isFetching={contractsQuery.isFetching}
			recordHeight={ROW_HEIGHT}
			exportAs={{
				name: `${$LL.common.nav.contracts()}.csv`,
				columns: [
					{
						header: $LL.common.labels.tenant(),
						value: (contract) => contract.tenantName?.trim() || $LL.common.labels.tenant()
					},
					{ header: $LL.common.labels.governmentId(), value: (contract) => contract.govId.trim() },
					{ header: $LL.common.labels.start(), value: (contract) => formatDate(contract.start) },
					{ header: $LL.common.labels.end(), value: (contract) => formatDate(contract.end) },
					{
						header: $LL.common.nav.payments(),
						value: (contract) => formatLocaleNumber($locale, contract.paymentCount)
					},
					{
						header: $LL.common.labels.status(),
						value: (contract) => $LL.common.status[contract.status]()
					},
					{
						header: $LL.common.labels.paymentFulfillment(),
						value: (contract) =>
							formatLocaleRangeWithUnit(
								$locale,
								contract.paidAmount,
								contract.expectedAmount,
								$LL.common.messages.sar()
							)
					}
				]
			}}
			onCreate={contractActions.create}
		>
			{#snippet record(contract: ContractRow)}
				<ContractRecord {contract} actions={contractActions.of(contract)} />
			{/snippet}
		</List>
	{/snippet}
</ContractActions>
