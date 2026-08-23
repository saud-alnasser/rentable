<script lang="ts">
	import { resolve } from '$app/paths';
	import { back } from '@rentable/design/back.svelte.js';
	import type { Payment } from '$lib/platform/database/schema';
	import DeleteDialog from '$lib/design/block/delete-dialog.svelte';
	import RecordActionControl from '$lib/design/block/record-action-control.svelte';
	import RecordCard, { type RecordCardAction } from '$lib/design/block/record-card.svelte';
	import SelectionDialog from '$lib/design/block/selection-dialog.svelte';
	import List from '$lib/design/block/list.svelte';
	import * as Cell from '$lib/design/cell';
	import { toNarrowedName } from '$lib/design/csv';
	import {
		describeRefusals,
		foreseenRefusals,
		type SelectionPlan
	} from '@rentable/design/selection.js';
	import { PERIOD_FILTER, toChosenLabel, type FilterSelection } from '$lib/design/filter';
	import { isFilterPeriod } from '$lib/api/period';
	import {
		getRemainingContractBalance,
		hasSatisfiedContractPaymentRequirement,
		toContractName
	} from '$lib/contract/contract';
	import { useFetchContract } from '$lib/contract/query';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import {
		formatPaymentLedgerMonth,
		paymentLedgerMonths,
		type PaymentLedgerMonth
	} from '$lib/payment/ledger';
	import {
		useDeleteManyPayments,
		useDeletePayment,
		useListContractPayments,
		usePlanManyPayments,
		type PaymentRefusalReason
	} from '$lib/payment/query';
	import { formatLocaleMoney, formatLocaleMoneyRange } from '$lib/platform/locale';
	import DirectoryImportDialog from '$lib/workspace/component/directory-import-dialog.svelte';
	import { useImportRecords } from '$lib/workspace/query';
	import { toTransferInput } from '$lib/workspace/workspace';
	import SquarePenIcon from '@lucide/svelte/icons/square-pen';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import PaymentForm from './form.svelte';

	/** The contract whose payments this statement lists. */
	let { contractId }: { contractId: string } = $props();

	// one line of text and the breathing room around it; the shell lays rows out at this
	// height rather than measuring them.
	const ROW_HEIGHT = 52;
	// the marker's own height. The space that separates one month from the records above it is
	// the list block's, not this figure — the block owns the gap between cards and the two have
	// to be set against each other.
	const MONTH_HEIGHT = 34;

	let search = $state('');
	let filters = $state<FilterSelection>({});
	let payment = $state<Payment | undefined>(undefined);
	let isPaymentFormOpen = $state(false);
	let isDeleteDialogOpen = $state(false);
	let importDialog = $state<ReturnType<typeof DirectoryImportDialog> | undefined>(undefined);
	// the records the reader has picked out, and the set a control was reached for with. The two
	// are separate because the selection stays live behind the confirmation, and an action that
	// read it again at submit time would act on whatever it had become.
	let selected = $state<string[]>([]);
	let confirming = $state<string[] | null>(null);

	// the statement is the surface a period was put in the vocabulary for: a ledger is read to
	// answer *what was paid, and when*, and until now the only way to ask about one month was to
	// type its digits into the search.
	const period = $derived.by(() => {
		const chosen = filters[PERIOD_FILTER.id];

		return isFilterPeriod(chosen) ? chosen : undefined;
	});

	const contractQuery = useFetchContract(() => contractId);
	const paymentsQuery = useListContractPayments(() => ({ contractId, search, period }));
	const deleteMutation = useDeletePayment();
	const deleteManyMutation = useDeleteManyPayments();
	const importMutation = useImportRecords();

	const planQuery = usePlanManyPayments(() => confirming ?? []);

	const payments = $derived(paymentsQuery.data ?? []);
	const monthOf = $derived(paymentLedgerMonths(payments));

	const isTerminated = $derived(contractQuery.data?.status === 'terminated');
	// what this ledger is a ledger of, named the way anything outside a contract's own page
	// names one.
	const contractName = $derived(
		contractQuery.data
			? toContractName(contractQuery.data, $LL.common.labels.contract())
			: $LL.common.labels.contract()
	);
	const tenantName = $derived(contractQuery.data?.tenantName?.trim() ?? '');
	const isFullyPaid = $derived(
		contractQuery.data
			? hasSatisfiedContractPaymentRequirement(
					contractQuery.data.paidAmount,
					contractQuery.data.expectedAmount
				)
			: false
	);
	// a terminated contract is read-only; a satisfied one still takes corrections to what it
	// already holds, so only the new payment is refused.
	const isAddLocked = $derived(isTerminated || isFullyPaid);
	const hasRowActions = $derived(!isTerminated);

	const lockNotice = $derived.by(() => {
		if (isTerminated) return $LL.contracts.payments.terminatedNotice();
		if (isFullyPaid) return $LL.contracts.payments.fullyPaidNotice();

		return undefined;
	});

	const formatMonth = (month: PaymentLedgerMonth) => formatPaymentLedgerMonth($locale, month);
	const formatMoney = (value: number) => formatLocaleMoney($locale, value);

	// what the deletion would do, as the shared confirmation states it. `null` while the plan is
	// still being read, which is what puts that dialog in its waiting state.
	//
	// The amount becomes the name here rather than in the procedure, because a payment has no
	// name and the nearest thing to one is money: only this side knows the reader's locale, and
	// a figure rendered one way in a ledger and another in a confirmation is two answers to one
	// question.
	const plan = $derived.by((): SelectionPlan | null => {
		if (!confirming || !planQuery.data) {
			return null;
		}

		return {
			eligible: planQuery.data.eligible,
			refused: planQuery.data.refused.map((refusal) => ({
				id: refusal.id,
				// a payment that is no longer there has no amount to give, and nothing else about it
				// survived to name it by.
				name: refusal.reason === 'missing' ? '' : formatMoney(refusal.amount),
				reason: refusal.reason
			}))
		};
	});

	// the reasons a deletion can turn a payment away for, in the order they are worth reading: the
	// rule the action is about first, and *gone from under you* last, because it is the one
	// nothing the reader did caused.
	const REFUSAL_ORDER = [
		'contract-terminated',
		'missing'
	] as const satisfies readonly PaymentRefusalReason[];

	// every reason the domain can give, with the sentence it reads as. `satisfies` is what makes a
	// reason added to the rule without a sentence a build failure rather than a refusal the reader
	// is shown under somebody else's words. The lookup around it is `describeRefusals`.
	const describeReason = $derived(
		describeRefusals({
			'contract-terminated': (count: number) =>
				$LL.contracts.selection.paymentRefusedContractTerminated({ count }),
			missing: (count: number) => $LL.contracts.selection.paymentRefusedMissing({ count })
		} satisfies Record<PaymentRefusalReason, (count: number) => string>)
	);

	/**
	 * Delete the set the reader agreed to.
	 *
	 * Nothing is announced here. The declaration behind the call says how many went through, and
	 * says what the workspace turned away after the confirmation was drawn, both through the shared
	 * handlers, which is where every announcement in this application is raised from.
	 */
	async function deleteSelected() {
		if (!confirming) {
			return;
		}

		const result = await deleteManyMutation.mutateAsync({
			ids: confirming,
			foreseen: foreseenRefusals(plan)
		});

		// a deleted payment's own page may be behind the reader, and it is not somewhere back can
		// return to now. The single-record deletion does this for the one record it removed; a
		// selection does it for every record it removed.
		for (const removed of result.deleted) {
			back.forget(resolve(`/contracts/payments/${removed.id}`));
		}

		// the selection is put down, and the dialog closes itself once this resolves: unmounting it
		// from here would take it off screen mid-close.
		selected = [];
	}

	function openPaymentForm(record?: Payment) {
		payment = record;
		isPaymentFormOpen = true;
	}

	// a terminated contract's statement is read-only, and an empty list is how a card comes to
	// carry no control and to leave the context gesture alone.
	const cardActions = (entry: Payment): RecordCardAction[] =>
		hasRowActions
			? [
					{
						label: $LL.common.actions.edit(),
						icon: SquarePenIcon,
						onSelect: () => openPaymentForm(entry)
					},
					{
						label: $LL.common.actions.delete(),
						icon: Trash2Icon,
						variant: 'destructive',
						onSelect: () => {
							payment = entry;
							isDeleteDialogOpen = true;
						}
					}
				]
			: [];
</script>

{#snippet selectionActions(ids: readonly string[])}
	<!-- the same control a record's own menu wears, so a deletion means the same thing and looks
	     the same whether it is aimed at one payment or at nine. Delete and nothing else: it is the
	     only thing a payment admits being done to several at a time.

	     Withheld on a terminated contract along with the row controls, because a locked statement
	     takes no changes. The snippet is still passed, so selection itself stays on there: what a
	     reader may do with a selection is no longer only destructive, and exporting part of a
	     statement is a reading rather than a change. -->
	{#if hasRowActions}
		<RecordActionControl
			label={`${$LL.common.actions.delete()} · ${$LL.common.table.recordsSelected({ count: ids.length })}`}
			icon={Trash2Icon}
			tone="error"
			onclick={() => (confirming = [...ids])}
		/>
	{/if}
{/snippet}

<div class="flex min-h-0 flex-1 flex-col gap-3">
	{#if lockNotice}
		<p class="shrink-0 rounded-2xl bg-card px-4 py-2.5 text-start text-xs text-muted-foreground">
			{lockNotice}
		</p>
	{/if}

	<List
		data={payments}
		bind:search
		bind:filters
		filterOptions={[PERIOD_FILTER]}
		bind:selected
		{selectionActions}
		groupOf={monthOf}
		isLoading={paymentsQuery.isLoading}
		isFetching={paymentsQuery.isFetching}
		recordHeight={ROW_HEIGHT}
		groupHeaderHeight={MONTH_HEIGHT}
		emptyDescription={isAddLocked ? undefined : $LL.contracts.payments.trackSummary()}
		exportAs={{
			// the contract is in the name, because a ledger is one contract's and a file called
			// `payments` says nothing about which. What narrowed it follows, so a period asked for
			// and then exported does not silently replace the whole ledger beside it.
			name: toNarrowedName(`${$LL.common.nav.payments()} — ${contractName}`, [
				search,
				toChosenLabel(PERIOD_FILTER, filters, $LL) ?? ''
			]),
			columns: [
				// what a row belongs to, before what the row is. A ledger read on screen sits under
				// the contract's own page and needs neither; the same rows in a file have left that
				// page behind, and two ledgers in one folder are indistinguishable without them.
				{ header: $LL.common.labels.contract(), value: () => contractName },
				{ header: $LL.common.labels.tenant(), value: () => tenantName },
				{
					header: $LL.common.labels.paymentDate(),
					value: (entry) => ({ kind: 'date' as const, value: new Date(entry.date) })
				},
				{
					header: $LL.common.labels.amount(),
					value: (entry) => ({ kind: 'money' as const, value: entry.amount })
				}
			]
		}}
		onImport={isAddLocked ? undefined : () => void importDialog?.choose()}
		onCreate={isAddLocked ? undefined : () => openPaymentForm()}
	>
		{#snippet groupHeader(month: PaymentLedgerMonth)}
			<!-- a card in the list rather than a marker floating over it, and a separator rather than
			     a record: it takes the same space and the same corner as a payment card, and none of
			     the elevation or the lift, because there is nothing here to press. That is what keeps
			     it from reading as one of the rows it divides while still sitting in their rhythm.

			     Quieter than a record, not louder. The rows are what the reader came for
			     (_Emphasize by de-emphasizing_), so the month recedes and separates by being a
			     different kind of surface rather than by shouting over them. -->
			<!-- as wide as what it says and no wider. A separator the full width of the list is the
			     filled strip this replaced — at that width it reads as one more card in the column,
			     which is the thing that stopped the grouping being legible. Sized to its own content
			     it reads as a label on the list rather than an entry in it. -->
			<div
				class="flex h-full w-fit max-w-full items-center gap-2 rounded-2xl bg-muted/60 px-4 text-xs font-medium"
			>
				<span class="min-w-0 truncate tracking-wide uppercase">{formatMonth(month)}</span>
				<span class="text-muted-foreground" aria-hidden="true">&middot;</span>
				<span class="shrink-0 text-muted-foreground">
					<span class="sr-only">
						{$LL.contracts.payments.monthTotal({ month: formatMonth(month) })}
					</span>
					<Cell.Money amount={month.total} />
				</span>
			</div>
		{/snippet}

		{#snippet record(entry: Payment)}
			<RecordCard
				href={resolve(`/contracts/payments/${entry.id}`)}
				label={$LL.common.labels.payment()}
				actions={cardActions(entry)}
			>
				{#snippet content()}
					<span class="pointer-events-none relative min-w-0 flex-1 truncate text-start text-sm">
						<Cell.Date value={entry.date} />
					</span>
					<span class="pointer-events-none relative shrink-0 text-end text-sm font-medium">
						<Cell.Money amount={entry.amount} />
					</span>
				{/snippet}
			</RecordCard>
		{/snippet}
	</List>

	{#if contractQuery.data}
		{@const contract = contractQuery.data}
		<div
			class="flex shrink-0 flex-wrap items-end justify-between gap-x-6 gap-y-2 rounded-2xl bg-card px-4 py-3 motion-safe:animate-in motion-safe:fade-in"
		>
			<div class="flex min-w-0 flex-col gap-1 text-start">
				<span class="text-xs tracking-wide text-muted-foreground uppercase">
					{$LL.contracts.payments.remainingBalance()}
				</span>
				<span class="text-lg font-semibold">
					<Cell.Money
						amount={getRemainingContractBalance(contract.paidAmount, contract.expectedAmount)}
					/>
				</span>
			</div>
			<div class="flex min-w-0 flex-col gap-1 text-end">
				<span class="text-xs tracking-wide text-muted-foreground uppercase">
					{$LL.common.labels.paymentFulfillment()}
				</span>
				<span class="text-sm tabular-nums">
					{formatLocaleMoneyRange($locale, contract.paidAmount, contract.expectedAmount)}
				</span>
			</div>
		</div>
	{/if}
</div>

{#if confirming}
	{@const count = confirming.length}
	<SelectionDialog
		open
		onOpenChange={(isOpen) => {
			if (!isOpen) {
				confirming = null;
			}
		}}
		title={$LL.contracts.selection.paymentDeleteTitle()}
		selected={$LL.common.table.recordsSelected({ count })}
		{plan}
		reasons={REFUSAL_ORDER}
		{describeReason}
		summarize={(eligible) => $LL.contracts.selection.paymentDeleteSummary({ count: eligible })}
		confirmLabel={$LL.common.actions.delete()}
		confirmLoadingLabel={$LL.common.actions.deleting()}
		onSubmit={deleteSelected}
	/>
{/if}

<PaymentForm
	{contractId}
	value={payment}
	open={isPaymentFormOpen}
	onOpenChange={(isOpen) => {
		isPaymentFormOpen = isOpen;
		if (!isOpen) payment = undefined;
	}}
/>

<DeleteDialog
	open={isDeleteDialogOpen}
	onOpenChange={(isOpen) => {
		isDeleteDialogOpen = isOpen;
		if (!isOpen) payment = undefined;
	}}
	record={payment ? formatMoney(payment.amount) : undefined}
	onSubmit={async () => {
		if (payment) {
			await deleteMutation.mutateAsync(payment.id);
			// the payment's own page may be behind the reader; it is not somewhere back can
			// return to now that the record is gone.
			back.forget(resolve(`/contracts/payments/${payment.id}`));
		}
	}}
/>

<!-- a statement, coming back in. Each row names the contract it is against and that name is what
     places it, this contract included — a payment is nothing without one, and a statement read on
     the wrong contract's page would be the quietest way to put money against the wrong term.

     A payment has no name of its own, so what makes one recognisable is its contract, its day and
     its amount together. That is also what keeps a statement imported twice from paying the
     contract twice, while leaving two genuine payments of the same amount on the same day as the
     two payments they are. -->
<DirectoryImportDialog
	bind:this={importDialog}
	title={$LL.common.import.title({ record: $LL.common.nav.payments() })}
	concept="payments"
	onConfirm={async (transfer) => {
		await importMutation.mutateAsync(toTransferInput(transfer));
	}}
/>
