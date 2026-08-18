import { addUtcDays, type DateLike } from '$lib/api/date';
import { toPeriodRange, type FilterPeriod } from '$lib/api/period';
import * as s from '$lib/platform/database/schema';
import { and, gte, lt, type SQL } from 'drizzle-orm';

/**
 * PAYMENT PERIOD
 *
 * The one condition that decides whether a payment falls inside a period.
 *
 * **It exists so that two surfaces cannot disagree.** The landing screen's collected figure and
 * a contract's payment statement are read by two different routers, and the whole of acceptance
 * criterion 6 is that asked about one period they report the same money. Two `where` clauses
 * written to the same intention are two chances to write it differently — and the way they would
 * differ is not obvious, because both would look right.
 *
 * **Half-open at the top.** A period's end is a whole UTC day and a payment is stored with
 * whatever time of day it was given, so `date <= end` silently drops every payment made after
 * midnight on the last day of the span. That was the shape the dashboard's own figure had before
 * this module: correct on most days, and quietly short on the last day of every month.
 */
export function isPaymentWithinPeriod(period: FilterPeriod, now: DateLike): SQL {
	const { start, end } = toPeriodRange(period, now);

	return and(gte(s.payment.date, start), lt(s.payment.date, addUtcDays(end, 1))) as SQL;
}
