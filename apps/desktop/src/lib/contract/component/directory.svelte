<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import type api from '$lib/api/caller';
	import { hasCreateIntent } from '$lib/design/create-intent';
	import List from '$lib/design/block/list.svelte';
	import type { ListSort } from '$lib/design/sort';
	import { CONTRACT_SORT_COLUMN_IDS, type ContractSortColumnId } from '$lib/contract/contract';
	import {
		RANK_FILTER,
		RANK_FILTER_ID,
		readContractRank,
		toChosenRank
	} from '$lib/contract/rank-filter';
	import { useListContracts } from '$lib/contract/query';
	import { toChosenLabel, withFilter, type FilterSelection } from '$lib/design/filter';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { toNarrowedName } from '$lib/design/csv';
	import DirectoryImportDialog from '$lib/workspace/component/directory-import-dialog.svelte';
	import { useImportRecords } from '$lib/workspace/query';
	import { toTransferInput } from '$lib/workspace/workspace';
	import ContractActions from './actions.svelte';
	import ContractRecord from './record.svelte';
	import ContractSelectionActions from './selection-actions.svelte';

	type ContractRow = Awaited<ReturnType<typeof api.contract.getMany>>[number];

	// two lines of text and the breathing room around them; the shell lays rows out at this
	// height rather than measuring them.
	const ROW_HEIGHT = 64;

	let search = $state('');
	let sort = $state<ListSort | null>(null);
	let filters = $state<FilterSelection>({});
	let selected = $state<string[]>([]);
	let importDialog = $state<ReturnType<typeof DirectoryImportDialog> | undefined>(undefined);

	const importMutation = useImportRecords();

	const rank = $derived(toChosenRank(filters));

	const contractsQuery = useListContracts(
		() => search,
		() => sort,
		() => (rank ? { rank } : {})
	);

	const contracts = $derived(contractsQuery.data ?? []);

	// the same rendering the row shows, so the file reads as the screen does.

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

		filters = withFilter(filters, RANK_FILTER_ID, requested);
		void goto(resolve('/contracts'), { replaceState: true, noScroll: true, keepFocus: true });
	});
</script>

<ContractActions
	createRequested={hasCreateIntent(page.url)}
	onCreateRequestConsumed={clearCreateIntent}
>
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
					exportAs={{
						name: toNarrowedName($LL.common.nav.contracts(), [
							search,
							toChosenLabel(RANK_FILTER, filters, $LL) ?? ''
						]),
						columns: [
							{
								header: $LL.common.labels.tenant(),
								value: (contract) => contract.tenantName?.trim() || $LL.common.labels.tenant()
							},
							{
								header: $LL.common.labels.governmentId(),
								value: (contract) => contract.govId.trim()
							},
							// days, so the column sorts and a period can be asked of it. A formatted date was
							// text: `31 Jan 2026` sorts alphabetically, which puts April before January.
							{
								header: $LL.common.labels.start(),
								value: (contract) => ({ kind: 'date' as const, value: new Date(contract.start) })
							},
							{
								header: $LL.common.labels.end(),
								value: (contract) => ({ kind: 'date' as const, value: new Date(contract.end) })
							},
							{ header: $LL.common.nav.payments(), value: (contract) => contract.paymentCount },
							{
								header: $LL.common.labels.status(),
								value: (contract) => $LL.common.status[contract.status]()
							},
							// the pair the card draws as one fraction, as two columns of money. A file is not
							// a card: `1,500 / 18,000` is one string a spreadsheet can do nothing with, and
							// what a reader wants of a directory of contracts is the two totals under it.
							{
								header: $LL.common.labels.paid(),
								value: (contract) => ({ kind: 'money' as const, value: contract.paidAmount })
							},
							{
								header: $LL.common.labels.expected(),
								value: (contract) => ({ kind: 'money' as const, value: contract.expectedAmount })
							}
						]
					}}
					onImport={() => void importDialog?.choose()}
					onCreate={contractActions.create}
				>
					{#snippet record(contract: ContractRow)}
						<ContractRecord {contract} actions={contractActions.of(contract)} />
					{/snippet}
				</List>
			{/snippet}
		</ContractSelectionActions>
	{/snippet}
</ContractActions>

<!-- a file of contracts, coming in. A contract points at more than any other record here — its
     tenant, and every unit it holds — and each is named rather than numbered, so each is resolved
     against the workspace before a single row is written.

     The file this directory writes is a document for a person: it carries the figures that were
     on the row and not the fields a contract is made of, so it can say which contracts it is
     about without being able to make one. Read back it reports exactly that, which is the point
     — an export of this list can never quietly double it. -->
<DirectoryImportDialog
	bind:this={importDialog}
	title={$LL.common.import.title({ record: $LL.common.nav.contracts() })}
	concept="contracts"
	onConfirm={async (transfer) => {
		await importMutation.mutateAsync(toTransferInput(transfer));
	}}
/>
