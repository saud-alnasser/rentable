import type { Payment } from '$lib/platform/database/schema';
import { toUtcDay, type DateLike } from '$lib/api/date';
import { TRPCError } from '@trpc/server';

/**
 * PAYMENT
 *
 * the payment domain module: what payments are worth in aggregate, how they are grouped
 * by the contract they were made against, and the one rule an amount answers on its own.
 * Anything that measures payments against a contract's arithmetic is the contract
 * domain's, and depends on this module rather than the other way round.
 */

/** a payment as a caller holds it, with the date in whichever form it arrived. */
export type PaymentLike = Omit<Pick<Payment, 'amount' | 'date'>, 'date'> & {
	date: DateLike;
};

export function getPaidAmount(payments: PaymentLike[]) {
	return payments.reduce((sum, payment) => sum + payment.amount, 0);
}

/** groups payment rows by their contract, preserving row order within each group. */
export function groupPaymentsByContractId<P extends { contractId: number }>(payments: P[]) {
	const paymentsByContractId = new Map<number, P[]>();

	for (const payment of payments) {
		paymentsByContractId.set(payment.contractId, [
			...(paymentsByContractId.get(payment.contractId) ?? []),
			payment
		]);
	}

	return paymentsByContractId;
}

export function ensureValidPaymentAmount(amount: number) {
	if (amount <= 0) {
		throw new TRPCError({
			code: 'BAD_REQUEST',
			message: 'payment amount must be greater than zero'
		});
	}
}

/**
 * A payment records money already received, so its date cannot be later than today.
 *
 * Compared as whole UTC days, as every date in this domain is: a payment dated today is taken
 * whatever the time of day, and the answer does not change with the machine's timezone. Nothing
 * here bounds how far back a date may go — a payment recorded late is ordinary, and the contract
 * arithmetic already ignores dates outside the period.
 */
export function ensurePaymentIsNotInTheFuture(date: DateLike, now: DateLike) {
	if (toUtcDay(date).getTime() > toUtcDay(now).getTime()) {
		throw new TRPCError({
			code: 'BAD_REQUEST',
			message: 'a payment cannot be dated in the future'
		});
	}
}
