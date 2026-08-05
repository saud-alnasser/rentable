import { toUtcDay } from '$lib/api/date';
import type { Locales } from '$lib/i18n/i18n-types';
import type { PaymentLike } from '$lib/payment/payment';
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
	/** What the payments given to `paymentLedgerMonths` add up to in this month. */
	total: number;
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
 * Totals are summed once, up front, so a list asking a group per row costs one pass rather
 * than one per row. A payment that was not in the set reads its own month with a total of
 * zero: it contributed to none of them, and saying so is cheaper than forbidding it.
 *
 * The set's order is never read — a month is decided by the date on the row, so the caller
 * stays free to render the payments in whatever order its query returned.
 */
export function paymentLedgerMonths<P extends PaymentLike>(payments: readonly P[]) {
	const totals = new Map<string, number>();

	for (const payment of payments) {
		const key = monthKey(monthStart(payment.date));

		totals.set(key, (totals.get(key) ?? 0) + payment.amount);
	}

	return (payment: PaymentLike): PaymentLedgerMonth => {
		const start = monthStart(payment.date);
		const key = monthKey(start);

		return { key, start, total: totals.get(key) ?? 0 };
	};
}
