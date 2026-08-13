<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import type api from '$lib/api/caller';
	import { hasCreateIntent } from '$lib/design/create-intent';
	import DeleteDialog from '$lib/design/block/delete-dialog.svelte';
	import List from '$lib/design/block/list.svelte';
	import RecordCardMenu, { type RecordCardAction } from '$lib/design/block/record-card-menu.svelte';
	import { AWAITING_BLOCKERS } from '$lib/design/confirmation';
	import type { ListSort } from '$lib/design/sort';
	import {
		canManuallyTerminateContractStatus,
		canUnterminateContractStatus,
		CONTRACT_SORT_COLUMN_IDS,
		isContractDeletable,
		type ContractSortColumnId
	} from '$lib/contract/contract';
	import { CONTRACT_RANKS, type ContractRank } from '$lib/contract/rank';
	import { readContractRank } from '$lib/contract/rank-filter';
	import {
		useDeleteContract,
		useFetchContractUnits,
		useListContracts,
		useTerminateContract,
		useUnterminateContract
	} from '$lib/contract/query';
	import { useFetchContractPayments } from '$lib/payment/query';
	import { Button } from '$lib/design/primitive/button';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { formatRecordDate } from '$lib/design/date';
	import { formatLocaleNumber, formatLocaleRangeWithUnit } from '$lib/platform/locale';
	import BanIcon from '@lucide/svelte/icons/ban';
	import FilesIcon from '@lucide/svelte/icons/files';
	import RotateCcwIcon from '@lucide/svelte/icons/rotate-ccw';
	import SquarePenIcon from '@lucide/svelte/icons/square-pen';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import { untrack } from 'svelte';
	import ContractForm from './form.svelte';
	import ContractRecord from './record.svelte';

	type ContractRow = Awaited<ReturnType<typeof api.contract.getMany>>[number];
	// the same shape without an identity is what a duplicate opens the form on.
	type ContractFormValue = Omit<ContractRow, 'id'> & { id?: number };

	// two lines of text and the breathing room around them; the shell lays rows out at this
	// height rather than measuring them.
	const ROW_HEIGHT = 64;

	let search = $state('');
	let sort = $state<ListSort | null>(null);
	let rank = $state<ContractRank | null>(null);
	let isContractFormOpen = $state(false);
	let contractFormRenderKey = $state(0);
	let formOpensOn = $state<ContractFormValue | undefined>(undefined);
	// the one record a card's menu is acting on and what it is being asked, which is what makes
	// one confirmation of each kind enough for a whole directory.
	let confirming = $state<{
		contract: ContractRow;
		kind: 'delete' | 'terminate' | 'restore';
	} | null>(null);

	const contractsQuery = useListContracts(
		() => search,
		() => sort,
		() => (rank ? { rank } : {})
	);
	const deleteMutation = useDeleteContract();
	const terminateMutation = useTerminateContract();
	const unterminateMutation = useUnterminateContract();

	// what a deletion would be refused for, read for the record being acted on and only while a
	// deletion is what it is being asked. Both reads, because the rule weighs both.
	const isDeleting = $derived(confirming?.kind === 'delete');
	const heldUnitsQuery = useFetchContractUnits(
		() => confirming?.contract.id ?? 0,
		() => isDeleting
	);
	const heldPaymentsQuery = useFetchContractPayments(
		() => confirming?.contract.id ?? 0,
		() => isDeleting
	);
	const deleteBlockers = $derived.by(() => {
		if (!isDeleting) {
			return [];
		}

		if (heldUnitsQuery.isPending || heldPaymentsQuery.isPending) {
			return AWAITING_BLOCKERS;
		}

		const units = heldUnitsQuery.data ?? [];
		const payments = heldPaymentsQuery.data ?? [];

		if (isContractDeletable(units, payments)) {
			return [];
		}

		return [
			units.length ? $LL.common.deleteDialog.blockedUnits({ count: units.length }) : null,
			payments.length ? $LL.common.deleteDialog.blockedPayments({ count: payments.length }) : null
		].filter((blocker) => blocker !== null);
	});

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

	const openCreateContractForm = () => {
		formOpensOn = undefined;
		contractFormRenderKey += 1;
		isContractFormOpen = true;
	};

	const openContractForm = (value: ContractFormValue) => {
		formOpensOn = value;
		contractFormRenderKey += 1;
		isContractFormOpen = true;
	};

	// what the record's own page offers, minus opening it, and offered on exactly the same terms:
	// the predicates that decide whether a contract may be terminated or put back are the domain's,
	// so a card and a page cannot come to disagree about what may be done to one.
	const cardActions = (contract: ContractRow): RecordCardAction[] => [
		{
			label: $LL.common.actions.duplicate(),
			icon: FilesIcon,
			onSelect: () =>
				// the government id is a contract's unique field, so the copy starts without it rather
				// than with a value that cannot be saved.
				openContractForm({ ...contract, id: undefined, govId: '' })
		},
		...(contract.status === 'terminated'
			? []
			: [
					{
						label: $LL.common.actions.edit(),
						icon: SquarePenIcon,
						onSelect: () => openContractForm(contract)
					}
				]),
		...(canManuallyTerminateContractStatus(contract.status)
			? [
					{
						label: $LL.common.actions.terminate(),
						icon: BanIcon,
						variant: 'destructive' as const,
						onSelect: () => {
							confirming = { contract, kind: 'terminate' };
						}
					}
				]
			: []),
		...(canUnterminateContractStatus(contract.status)
			? [
					{
						label: $LL.common.actions.unterminate(),
						icon: RotateCcwIcon,
						onSelect: () => {
							confirming = { contract, kind: 'restore' };
						}
					}
				]
			: []),
		{
			label: $LL.common.actions.delete(),
			icon: Trash2Icon,
			variant: 'destructive',
			onSelect: () => {
				confirming = { contract, kind: 'delete' };
			}
		}
	];

	// what the confirmation names the record as, the way its own page names it.
	const confirmingRecord = $derived(
		confirming
			? confirming.contract.govId?.trim() ||
					confirming.contract.tenantName?.trim() ||
					$LL.common.labels.contract()
			: undefined
	);

	const runOnConfirming = async (run: (id: number) => Promise<unknown>) => {
		if (!confirming) {
			return;
		}

		await run(confirming.contract.id);
		confirming = null;
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
	onCreate={openCreateContractForm}
>
	{#snippet record(contract: ContractRow)}
		<RecordCardMenu actions={cardActions(contract)}>
			{#snippet card(trigger)}
				<ContractRecord {contract} {trigger} />
			{/snippet}
		</RecordCardMenu>
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
		value={formOpensOn}
	/>
{/key}

<DeleteDialog
	open={confirming?.kind === 'delete'}
	onOpenChange={(isOpen) => {
		if (!isOpen) {
			confirming = null;
		}
	}}
	record={confirmingRecord}
	blockers={deleteBlockers}
	onSubmit={() => runOnConfirming((id) => deleteMutation.mutateAsync(id))}
/>

<DeleteDialog
	open={confirming?.kind === 'terminate'}
	onOpenChange={(isOpen) => {
		if (!isOpen) {
			confirming = null;
		}
	}}
	record={confirmingRecord}
	title={$LL.contracts.table.terminateTitle()}
	description={$LL.contracts.table.terminateDescription()}
	confirmLabel={$LL.common.actions.terminate()}
	confirmLoadingLabel={$LL.common.actions.terminating()}
	onSubmit={() => runOnConfirming((id) => terminateMutation.mutateAsync(id))}
/>

<DeleteDialog
	open={confirming?.kind === 'restore'}
	onOpenChange={(isOpen) => {
		if (!isOpen) {
			confirming = null;
		}
	}}
	record={confirmingRecord}
	title={$LL.contracts.table.restoreTitle()}
	description={$LL.contracts.table.restoreDescription()}
	confirmLabel={$LL.common.actions.unterminate()}
	confirmLoadingLabel={$LL.common.actions.restoring()}
	confirmVariant="default"
	onSubmit={() => runOnConfirming((id) => unterminateMutation.mutateAsync(id))}
/>
