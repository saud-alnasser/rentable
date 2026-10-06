import { toUtcDay } from '$lib/date';
import type { Locales, TranslationFunctions } from '$lib/i18n/i18n-types';
import { isRefund, type PaymentLike } from '$lib/contract';
import type { Payment } from '$lib/platform/database/schema';
import type { ExportColumn } from '@rentable/design/csv.js';
import { formatLocaleDate } from '$lib/platform/locale';

/**
 * LEDGER
 *
 * how a contract's payments read as an account statement: which calendar month a row
 * belongs to, and what the rows of that month add up to. The month is the unit the
 * statement is written in, so it is derived here rather than in the surface that renders
 * it or in the query that returns the rows.
 *
 * What a contract still owes is not here. That is the contract's own arithmetic over its
 * materialized aggregates, and summing these rows would answer a different question — the
 * rows are whatever the current search returned.
 */

/** One calendar month of a ledger, as the group header above its rows states it. */
export type PaymentLedgerMonth = {
	/** `YYYY-MM` in UTC. Zero-padded, so text order and date order are the same order. */
	key: string;
	/** UTC midnight on the first of the month, for the reader's own month formatting. */
	start: number;
	/**
	 * What the payments given to `paymentLedgerMonths` received in this month. A refund is not
	 * taken off it: the header states money in and money out side by side, never netted (effort
	 * 854, requirement 25).
	 */
	total: number;
	/** What the refunds given to `paymentLedgerMonths` returned in this month, zero where none. */
	returned: number;
};

/**
 * How a month is written above its rows.
 *
 * The calendar is pinned to the one the grouping is cut in. `paymentLedgerMonths` takes its
 * boundaries from `Date.UTC`, which is Gregorian; a locale whose default calendar is another
 * — ICU prefers Umm al-Qura for `ar-SA` — would name a month that no run of rows follows,
 * and rows under one header would span two of the months it was naming.
 */
export const PAYMENT_LEDGER_MONTH_FORMAT: Intl.DateTimeFormatOptions = {
	month: 'long',
	year: 'numeric',
	timeZone: 'UTC',
	calendar: 'gregory'
};

/** The name of a ledger month, as the header above its rows states it. */
export function formatPaymentLedgerMonth(locale: Locales, month: PaymentLedgerMonth) {
	return formatLocaleDate(locale, month.start, PAYMENT_LEDGER_MONTH_FORMAT);
}

function monthStart(date: PaymentLike['date']) {
	const day = toUtcDay(date);

	return Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 1);
}

function monthKey(start: number) {
	return new Date(start).toISOString().slice(0, 7);
}

/**
 * The month each of `payments` belongs to, as a lookup over the set.
 *
 * What each month received and what it returned are summed once, up front, so a list asking a group per row costs one pass rather
 * than one per row. A payment that was not in the set reads its own month with a total of
 * zero: it contributed to none of them, and saying so is cheaper than forbidding it.
 *
 * The set's order is never read — a month is decided by the date on the row, so the caller
 * stays free to render the payments in whatever order its query returned.
 */
export function paymentLedgerMonths<P extends PaymentLike>(payments: readonly P[]) {
	const totals = new Map<string, number>();
	const returns = new Map<string, number>();

	for (const payment of payments) {
		const key = monthKey(monthStart(payment.date));
		const sums = isRefund(payment) ? returns : totals;

		sums.set(key, (sums.get(key) ?? 0) + payment.amount);
	}

	return (payment: PaymentLike): PaymentLedgerMonth => {
		const start = monthStart(payment.date);
		const key = monthKey(start);

		return { key, start, total: totals.get(key) ?? 0, returned: returns.get(key) ?? 0 };
	};
}

/**
 * The columns a contract's ledger is exported with: what the rows belong to, then each payment
 * signed and spelled as the workspace's own payments sheet writes it (effort 854, requirement 30).
 * A refund is a negative amount and the method is the stored word, so a ledger exported here reads
 * back through the same import with every field a person entered.
 *
 * The contract and the tenant come first because a ledger read on screen sits under the contract's
 * own page and needs neither; the same rows in a file have left that page behind, and two ledgers
 * in one folder are indistinguishable without them. The contract is written as the reference a
 * workspace file calls it by (`toContractReferences`), which is what the import resolves it from:
 * its government number where it has one, and otherwise its tenant's national id and the day its
 * term started, spelled further where another contract shares both. The tenant is for the reader
 * and the import does not read it.
 */
export function paymentLedgerColumns(
	t: TranslationFunctions,
	reference: string,
	tenant: string
): ExportColumn<Payment>[] {
	return [
		{ header: t.common.labels.contract(), value: () => reference },
		{ header: t.common.labels.tenant(), value: () => tenant },
		{
			header: t.common.labels.paymentDate(),
			value: (payment) => ({ kind: 'date', value: new Date(payment.date) })
		},
		{
			header: t.common.labels.amount(),
			value: (payment) => ({
				kind: 'money',
				value: payment.direction === 'refund' ? -payment.amount : payment.amount
			})
		},
		{ header: t.contracts.payments.method(), value: (payment) => payment.method },
		{ header: t.contracts.payments.reference(), value: (payment) => payment.reference },
		{ header: t.contracts.payments.note(), value: (payment) => payment.note }
	];
}
