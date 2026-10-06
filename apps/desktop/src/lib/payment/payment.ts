import type { Database } from '$lib/api/context';
import type { Contract, Payment } from '$lib/platform/database/schema';
import * as s from '$lib/platform/database/schema';
import { toUtcDay, type DateLike } from '$lib/date';
import { refuse } from '$lib/api/refusal';
import { inArray } from 'drizzle-orm';

/**
 * PAYMENT
 *
 * the payment domain module: how payments are grouped by the contract they were made
 * against, and the one rule an amount answers on its own. Anything that measures payments
 * against a contract's arithmetic, what they add up to included, is the contract domain's:
 * the payment depends on the contract, and what the contract needs of its payments it is
 * handed through what the payment contributes ({@link paymentsOf}).
 */

/** groups payment rows by their contract, preserving row order within each group. */
export function groupPaymentsByContractId<P extends { contractId: string }>(payments: P[]) {
	const paymentsByContractId = new Map<string, P[]>();

	for (const payment of payments) {
		paymentsByContractId.set(payment.contractId, [
			...(paymentsByContractId.get(payment.contractId) ?? []),
			payment
		]);
	}

	return paymentsByContractId;
}

/**
 * Every payment made against each of the contracts named, by the contract's id: what the payment
 * contributes to the contract, whose settlement reads it (`ContractContributions` in
 * `$lib/contract`). No contract named reads nothing.
 */
export async function paymentsOf(db: Database, contractIds: readonly string[]) {
	const payments = contractIds.length
		? await db.select().from(s.payment).where(inArray(s.payment.contractId, contractIds))
		: [];

	return groupPaymentsByContractId(payments);
}

/**
 * Why one payment in a selection would be turned away.
 *
 * **The ticket and the spec both said a payment is refused for nothing, and the source says
 * otherwise**: `payments.delete` calls `ensureContractIsNotTerminated`, so a payment on a
 * terminated contract is locked like everything else about that contract. The ledger hides its
 * row controls there, which is why nobody had met the rule, and hiding a control is not the same
 * as the rule not existing: another device can terminate the contract while a confirmation is
 * open. Requirement 3 of the effort's spec is corrected in the same commit as this.
 *
 * `missing` is not a rule this concept enforces: it says the row named is no longer in the
 * workspace, which every selection can meet.
 *
 * `refunds-exceed-received` is the contract's rule that what it returned stays within what it
 * received (effort 854, requirement 26), which a payment received on a live contract meets when
 * the refunds it holds lean on it. It is weighed over the whole selection, per contract, so it is
 * the planner's to answer rather than {@link whatRefusesPaymentDeletion}'s.
 */
export type PaymentRefusalReason = 'contract-terminated' | 'refunds-exceed-received' | 'missing';

/**
 * The keys a contract's ledger may be ordered by: the day a payment was made and its amount,
 * which is all a ledger row shows. The router orders on this list and the ledger's sort control
 * is built from it, so the control cannot offer an order the query cannot answer.
 */
export const PAYMENT_SORT_COLUMN_IDS = ['date', 'amount'] as const;

export type PaymentSortColumnId = (typeof PAYMENT_SORT_COLUMN_IDS)[number];

/** Whether `columnId` is one the ledger may be ordered by. */
export function isPaymentSortColumnId(columnId: string): columnId is PaymentSortColumnId {
	return (PAYMENT_SORT_COLUMN_IDS as readonly string[]).includes(columnId);
}

/**
 * Why deleting this payment would be refused, or `undefined` where it would go through.
 *
 * It asks about the contract, because what locks a payment is the contract's state, and about the
 * payment's direction, because a refund is the one row that state does not lock: a refund is how
 * a terminated contract is settled, so it is corrected there directly rather than by restoring
 * the contract (effort 854, requirement 25).
 */
export const whatRefusesPaymentDeletion = (
	status: Contract['status'],
	direction: Payment['direction'] = 'received'
) =>
	status === 'terminated' && direction !== 'refund' ? ('contract-terminated' as const) : undefined;

/**
 * Whether an amount is one a payment may be for.
 *
 * Above zero, and the boundary is the whole of it: a payment of nothing moves no money, and money
 * going back to the tenant is a refund, a payment of its own direction rather than a negative one.
 *
 * Exported beside the assertion that raises on it because the transfer planning pass answers the
 * same question about a file before any write is attempted, and the two have to agree. The copy
 * it replaces there admitted zero. `payment/component/form.svelte` still states the rule a third
 * time, in its own schema, and folding that in is not this change's.
 */
export function hasValidPaymentAmount(amount: number) {
	return amount > 0;
}

export function ensureValidPaymentAmount(amount: number) {
	if (!hasValidPaymentAmount(amount)) {
		throw refuse('payment.amountNotPositive');
	}
}

/**
 * Whether a payment's date is one it cannot have been received on.
 *
 * Whole UTC days, like every date comparison in this domain, so a payment dated today is taken
 * whatever the time of day and the answer does not move with the machine's timezone.
 *
 * Exported beside the assertion that raises on it because the transfer planning pass answers the
 * same question about a file before any write is attempted, and a preview that called a row
 * importable while the write refused it would strand the reader on a file it had just approved.
 * `payment/component/form.svelte` bounds its date picker on the same reasoning, so this is the
 * second statement of the rule rather than the only one; folding that in is not this change's.
 */
export function isPaymentInTheFuture(date: DateLike, now: DateLike) {
	return toUtcDay(date).getTime() > toUtcDay(now).getTime();
}

/**
 * A payment records money already received, so its date cannot be later than today.
 *
 * Nothing here bounds how far back a date may go: a payment recorded late is ordinary, and the
 * contract arithmetic already ignores dates outside the period.
 */
export function ensurePaymentIsNotInTheFuture(date: DateLike, now: DateLike) {
	if (isPaymentInTheFuture(date, now)) {
		throw refuse('payment.datedInFuture');
	}
}
