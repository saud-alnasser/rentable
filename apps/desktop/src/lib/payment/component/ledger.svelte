<script lang="ts">
	import { resolve } from '$app/paths';
	import { back } from '$lib/design/back.svelte';
	import type { Payment } from '$lib/platform/database/schema';
	import DeleteDialog from '$lib/design/block/delete-dialog.svelte';
	import RecordCard, { type RecordCardAction } from '$lib/design/block/record-card.svelte';
	import List from '$lib/design/block/list.svelte';
	import * as Cell from '$lib/design/cell';
	import { formatRecordDate } from '$lib/design/date';
	import { PERIOD_FILTER, type FilterSelection } from '$lib/design/filter';
	import { isFilterPeriod } from '$lib/api/period';
	import {
		getRemainingContractBalance,
		hasSatisfiedContractPaymentRequirement
	} from '$lib/contract/contract';
	import { useFetchContract } from '$lib/contract/query';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import {
		formatPaymentLedgerMonth,
		paymentLedgerMonths,
		type PaymentLedgerMonth
	} from '$lib/payment/ledger';
	import { useDeletePayment, useListContractPayments } from '$lib/payment/query';
	import { formatLocaleRangeWithUnit, formatLocaleValueWithUnit } from '$lib/platform/locale';
	import SquarePenIcon from '@lucide/svelte/icons/square-pen';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import PaymentForm from './form.svelte';

	/** The contract whose payments this statement lists. */
	let { contractId }: { contractId: number } = $props();

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

	const payments = $derived(paymentsQuery.data ?? []);
	const monthOf = $derived(paymentLedgerMonths(payments));

	const isTerminated = $derived(contractQuery.data?.status === 'terminated');
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
	const formatMoney = (value: number) =>
		formatLocaleValueWithUnit($locale, value, $LL.common.messages.sar());

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
		groupOf={monthOf}
		isLoading={paymentsQuery.isLoading}
		isFetching={paymentsQuery.isFetching}
		recordHeight={ROW_HEIGHT}
		groupHeaderHeight={MONTH_HEIGHT}
		emptyDescription={isAddLocked ? undefined : $LL.contracts.payments.trackSummary()}
		exportAs={{
			name: `${$LL.common.nav.payments()}.csv`,
			columns: [
				{
					header: $LL.common.labels.paymentDate(),
					value: (entry) => formatRecordDate($locale, entry.date)
				},
				{
					header: $LL.common.labels.amount(),
					value: (entry) =>
						formatLocaleValueWithUnit($locale, entry.amount, $LL.common.messages.sar())
				}
			]
		}}
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
					{formatLocaleRangeWithUnit(
						$locale,
						contract.paidAmount,
						contract.expectedAmount,
						$LL.common.messages.sar()
					)}
				</span>
			</div>
		</div>
	{/if}
</div>

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
