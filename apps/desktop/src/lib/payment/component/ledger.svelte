<script lang="ts">
	import { resolve } from '$app/paths';
	import { back } from '@rentable/design/back.svelte.js';
	import type { Payment } from '$lib/platform/database/schema';
	import RecordActionControl from '@rentable/design/block/record-action-control.svelte';
	import RecordCard from '@rentable/design/block/record-card.svelte';
	import { Badge } from '@rentable/design/primitive/badge/index.js';
	import SelectionDialog from '@rentable/design/block/selection-dialog.svelte';
	import { toCardActions } from '$lib/act';
	import { List } from '$lib/list/ui';
	import * as Cell from '$lib/design/cell';
	import { toNarrowedName } from '@rentable/design/csv.js';
	import {
		describeRefusals,
		foreseenRefusals,
		type SelectionPlan
	} from '@rentable/design/selection.js';
	import { PERIOD_FILTER, toChosenLabel, type FilterSelection } from '$lib/list';
	import { isFilterPeriod } from '$lib/date';
	import { getRemainingContractBalance, isRefund, toContractName } from '$lib/contract';
	import { useFetchContract } from '$lib/contract/ui';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import {
		formatPaymentLedgerMonth,
		paymentLedgerMonths,
		type PaymentLedgerMonth
	} from '$lib/payment/ledger';
	import { toPaymentCreateUnavailable, toRefundCreateUnavailable } from '$lib/payment/acts';
	import { paymentMethodGlyph, paymentMethodLabel } from '$lib/payment/method';
	import { paymentLedgerColumns } from '$lib/payment/transfer';
	import { PAYMENT_SORT_COLUMN_IDS, type PaymentSortColumnId } from '$lib/payment/payment';
	import type { ListSort } from '@rentable/design/sort.js';
	import { paymentActs, paymentHost } from '$lib/payment/host.svelte';
	import {
		useDeleteManyPayments,
		useListContractPayments,
		usePlanManyPayments,
		type PaymentRefusalReason
	} from '$lib/payment/query';
	import { formatLocaleMoney, formatLocaleMoneyRange } from '$lib/platform/locale';
	import { DirectoryImportDialog } from '$lib/transfer/ui';
	import { useImportRecords } from '$lib/workspace/ui';
	import { toTransferInput } from '$lib/transfer';
	import { IMPORT_FLAGS, memberPermissions } from '$lib/permission';
	import LockIcon from '@lucide/svelte/icons/lock';
	import StickyNoteIcon from '@lucide/svelte/icons/sticky-note';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';

	/** The contract whose payments this statement lists. */
	let { recordId: contractId }: { recordId: string } = $props();

	// two lines of text and the breathing room around them: the day and the amount, then how it was
	// paid. The shell lays rows out at this height rather than measuring them, so a row that has
	// nothing for its second line keeps the height and centres its one line in it.
	const ROW_HEIGHT = 64;
	// a terminated contract's rows take a third line: a received payment says there why it is
	// locked and what unlocks it (effort 854, requirement 25). Every row of that ledger takes the
	// height, since the shell lays them out at one.
	const LOCKED_ROW_HEIGHT = 84;
	// the marker's own height. The space that separates one month from the records above it is
	// the list block's, not this figure — the block owns the gap between cards and the two have
	// to be set against each other.
	const MONTH_HEIGHT = 34;

	let search = $state('');
	let sort = $state<ListSort | null>(null);
	let filters = $state<FilterSelection>({});
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
	const paymentsQuery = useListContractPayments(() => ({ contractId, search, period, sort }));
	const deleteManyMutation = useDeleteManyPayments();
	const importMutation = useImportRecords();

	const planQuery = usePlanManyPayments(() => confirming ?? []);

	const payments = $derived(paymentsQuery.data ?? []);
	const monthOf = $derived(paymentLedgerMonths(payments));
	// a statement is read in months while it is read in time. Ordered by amount, the months would
	// open and close again on every row, so the headers go and the rows read as one run.
	const isReadInTime = $derived(!sort || sort.columnId === 'date');

	// the keys a ledger row shows, as the procedure orders by them. The record type is what makes
	// a missing label a type error.
	const sortOptions = $derived.by(() => {
		const labels: Record<PaymentSortColumnId, string> = {
			date: $LL.common.labels.paymentDate(),
			amount: $LL.common.labels.amount()
		};

		return PAYMENT_SORT_COLUMN_IDS.map((id) => ({ id, label: labels[id] }));
	});

	const isTerminated = $derived(contractQuery.data?.status === 'terminated');
	// what this ledger is a ledger of, named the way anything outside a contract's own page
	// names one.
	const contractName = $derived(
		contractQuery.data
			? toContractName(contractQuery.data, $LL.common.labels.contract())
			: $LL.common.labels.contract()
	);
	const tenantName = $derived(contractQuery.data?.tenantName?.trim() ?? '');
	// what a workspace file calls the contract, which is what the ledger's own import resolves it
	// from, so a ledger written out reads back whether the contract has a number or not.
	const contractReference = $derived(contractQuery.data?.reference ?? contractName);
	// why this contract takes no new payment, where it takes none: the create act's reason, which
	// the create control shows on hover and focus in place of a paragraph above the ledger. A
	// terminated contract is read-only; a satisfied one still takes corrections to what it already
	// holds, so only the new payment is refused. An import only ever adds payments, so it is refused
	// with the same reason, in the transfer menu, rather than taken out of it.
	const createUnavailable = $derived(toPaymentCreateUnavailable(contractQuery.data, $LL));
	const isAddLocked = $derived(createUnavailable !== undefined);
	// why the contract takes no refund now, where it takes none: nothing it holds may be returned.
	// A terminated contract takes one, since a refund is how it is settled (effort 854, requirements
	// 25 and 26).
	const refundUnavailable = $derived(toRefundCreateUnavailable(contractQuery.data, $LL));
	// the bar's one create opens the payment form, whose two tabs are the two ways money moves
	// (effort 854, requirement 25). So it is refused only where both are, with the payment's reason,
	// the one a reader looking to add money reads first.
	const createUnavailableWhole = $derived(
		createUnavailable && refundUnavailable ? createUnavailable : undefined
	);

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
		'refunds-exceed-received',
		'missing'
	] as const satisfies readonly PaymentRefusalReason[];

	// every reason the domain can give, with the sentence it reads as. `satisfies` is what makes a
	// reason added to the rule without a sentence a build failure rather than a refusal the reader
	// is shown under somebody else's words. The lookup around it is `describeRefusals`.
	const describeReason = $derived(
		describeRefusals({
			'contract-terminated': (count: number) =>
				$LL.contracts.selection.paymentRefusedContractTerminated({ count }),
			'refunds-exceed-received': (count: number) =>
				$LL.contracts.selection.paymentRefusedRefundsExceedReceived({ count }),
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

	// what a payment's card offers, projected from the one list its own page and the command menu
	// read (`payment/acts.ts`). The row is handed over with its contract's status, which is what
	// closes a terminated contract's statement to everything that writes, and with what the
	// contract is paid and requires, which is what refuses a duplicate on one paid in full.
	const cardActions = (entry: Payment) =>
		toCardActions(
			paymentActs,
			{
				...entry,
				contractStatus: contractQuery.data?.status,
				contractPaidAmount: contractQuery.data?.paidAmount,
				contractExpectedAmount: contractQuery.data?.expectedAmount
			},
			$LL
		);
</script>

{#snippet selectionActions(ids: readonly string[])}
	<!-- the same control a record's own menu wears, so a deletion means the same thing and looks
	     the same whether it is aimed at one payment or at nine. Delete and nothing else: it is the
	     only thing a payment admits being done to several at a time.

	     Offered on a terminated contract too, since its refunds are deleted there: the plan the
	     confirmation reads turns its received payments away, saying the contract is terminated
	     (effort 854, requirement 25). -->
	<RecordActionControl
		label={`${$LL.common.actions.delete()} · ${$LL.common.table.recordsSelected({ count: ids.length })}`}
		icon={Trash2Icon}
		tone="error"
		unavailable={memberPermissions.refusal('deletePayment', $LL)}
		onclick={() => (confirming = [...ids])}
	/>
{/snippet}

<div class="flex min-h-0 flex-1 flex-col gap-3">
	<List
		data={payments}
		bind:search
		bind:sort
		{sortOptions}
		bind:filters
		filterOptions={[PERIOD_FILTER]}
		bind:selected
		{selectionActions}
		groupOf={isReadInTime ? monthOf : undefined}
		isLoading={paymentsQuery.isLoading}
		isFetching={paymentsQuery.isFetching}
		recordHeight={isTerminated ? LOCKED_ROW_HEIGHT : ROW_HEIGHT}
		groupHeaderHeight={MONTH_HEIGHT}
		emptyTitle={$LL.contracts.payments.emptyTitle()}
		emptyDescription={isAddLocked ? undefined : $LL.contracts.payments.trackSummary()}
		exportAs={{
			// the contract is in the name, because a ledger is one contract's and a file called
			// `payments` says nothing about which. What narrowed it follows, so a period asked for
			// and then exported does not silently replace the whole ledger beside it.
			name: toNarrowedName(`${$LL.common.nav.payments()} — ${contractName}`, [
				search,
				toChosenLabel(PERIOD_FILTER, filters, $LL) ?? ''
			]),
			// what a row belongs to, then the row as the payments sheet writes it.
			columns: paymentLedgerColumns($LL, contractReference, tenantName)
		}}
		onImport={() => void importDialog?.choose()}
		importUnavailable={memberPermissions.refusalOfEvery(IMPORT_FLAGS, $LL) ?? createUnavailable}
		onCreate={() => paymentHost.create({ contractId })}
		createLabel={$LL.common.actions.newPayment()}
		createUnavailable={createUnavailableWhole}
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
			<!-- a month that returned money states it beside what it received, each named, and neither
			     taken off the other (effort 854, requirement 25). One that returned nothing reads as
			     it always has, its total alone. -->
			<div
				class="flex h-full w-fit max-w-full items-center gap-2 rounded-2xl bg-muted/60 px-4 text-xs font-medium"
				data-ledger-month
			>
				<span class="min-w-0 truncate uppercase">{formatMonth(month)}</span>
				<span class="text-muted-foreground" aria-hidden="true">&middot;</span>
				<span class="shrink-0 text-muted-foreground" data-month-received>
					<span class="sr-only">
						{$LL.contracts.payments.monthTotal({ month: formatMonth(month) })}
					</span>
					{#if month.returned > 0}
						<span aria-hidden="true">{$LL.contracts.payments.refund.monthReceived()}</span>
					{/if}
					<Cell.Money amount={month.total} />
				</span>
				{#if month.returned > 0}
					<span class="text-muted-foreground" aria-hidden="true">&middot;</span>
					<span class="shrink-0 text-muted-foreground" data-month-returned>
						<span class="sr-only">
							{$LL.contracts.payments.refund.monthReturnedTotal({ month: formatMonth(month) })}
						</span>
						<span aria-hidden="true">{$LL.contracts.payments.refund.monthReturned()}</span>
						<Cell.Money amount={month.returned} />
					</span>
				{/if}
			</div>
		{/snippet}

		{#snippet record(entry: Payment)}
			<RecordCard
				href={resolve(`/contracts/payments/${entry.id}`)}
				label={$LL.common.labels.payment()}
				actions={cardActions(entry)}
			>
				{#snippet content()}
					{@const reference = entry.reference?.trim() ?? ''}
					{@const note = entry.note?.trim() ?? ''}
					{@const refund = isRefund(entry)}
					<!-- a statement line: the day with the amount at its end, then, quieter, how it was
					     paid. What was never recorded is left out whole, glyph and all, and a row with
					     none of the three is the one line, centred in the row's height. -->
					<div class="pointer-events-none relative flex min-w-0 flex-1 flex-col gap-1">
						<div class="flex min-w-0 items-center gap-3 text-sm">
							<span class="min-w-0 flex-1 truncate text-start">
								<Cell.Date value={entry.date} />
							</span>
							<!-- a refund is money going out: tagged in words, and its amount carries the
							     sign, so neither colour nor position alone says which way it went. -->
							{#if refund}
								<Badge variant="outline" class="shrink-0" data-payment-refund>
									{$LL.contracts.payments.refund.tag()}
								</Badge>
							{/if}
							<span class="shrink-0 text-end font-medium" data-payment-amount>
								<Cell.Money amount={refund ? -entry.amount : entry.amount} />
							</span>
						</div>
						{#if entry.method || reference || note}
							<div
								class="flex min-w-0 items-center gap-2 text-xs text-muted-foreground"
								data-payment-how
							>
								{#if entry.method}
									{@const Glyph = paymentMethodGlyph(entry.method)}
									<!-- the glyph is beside the word and says nothing the word does not. -->
									<span class="flex shrink-0 items-center gap-1" data-payment-method>
										<Glyph class="size-3.5 shrink-0" aria-hidden="true" />
										{paymentMethodLabel(entry.method, $LL)}
									</span>
								{/if}
								{#if reference}
									<!-- a transfer, cheque or SADAD number is a machine's string, so it
									     runs left to right in either language. -->
									<span class="min-w-0 shrink truncate" data-payment-reference>
										<span class="sr-only">{$LL.contracts.payments.reference()}</span>
										<span dir="ltr">{reference}</span>
									</span>
								{/if}
								{#if note}
									<span class="flex min-w-0 flex-1 items-center gap-1" data-payment-note>
										<StickyNoteIcon class="size-3.5 shrink-0" aria-hidden="true" />
										<span class="sr-only">{$LL.contracts.payments.note()}</span>
										<span class="min-w-0 truncate"><bdi>{note}</bdi></span>
									</span>
								{/if}
							</div>
						{/if}
						{#if isTerminated && !refund}
							<!-- its acts are refused, and the row says why and what unlocks them rather
							     than leaving the reader to find a dimmed control (effort 854, requirement
							     25). The glyph is the terminated status's lock. -->
							<div
								class="flex min-w-0 items-center gap-1 text-xs text-muted-foreground"
								data-payment-locked
							>
								<LockIcon class="size-3.5 shrink-0" aria-hidden="true" />
								<span class="min-w-0 truncate">{$LL.contracts.payments.refund.locked()}</span>
							</div>
						{/if}
					</div>
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
				<span class="text-xs text-muted-foreground uppercase">
					{$LL.contracts.payments.remainingBalance()}
				</span>
				<span class="text-lg font-semibold">
					<Cell.Money
						amount={getRemainingContractBalance(contract.paidAmount, contract.expectedAmount)}
					/>
				</span>
			</div>
			<div class="ms-auto flex min-w-0 flex-col gap-1 text-end">
				<span class="text-xs text-muted-foreground uppercase">
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
