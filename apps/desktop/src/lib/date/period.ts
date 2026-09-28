import { addUtcDays, toUtcDay, type DateLike } from '$lib/date/date';
import { and, gte, lt, type AnyColumn, type SQL } from 'drizzle-orm';

/**
 * PERIOD
 *
 * The spans of time a reader can ask a surface about, and the UTC-day range each one covers.
 *
 * **One vocabulary, named once.** A period is not a date range the caller assembles — it is a
 * word the reader chooses, and two surfaces asked about *this month* have to mean the same
 * days or their answers cannot be compared. That is the whole reason this sits in the date
 * capability rather than beside a control: the landing figures and the payment ledger both spend it,
 * from two different routers, and a second copy of "what this month means" is a pair of surfaces
 * that quietly disagree.
 *
 * Ranges are whole UTC days at both ends, inclusive, like every other date comparison in this
 * application — so a period does not change what it covers with the machine's timezone.
 */

/** Every period a surface can be asked about, in the order a control offers them. */
export const FILTER_PERIODS = ['this-month', 'last-month', 'this-year', 'last-year'] as const;

/** A span of time a reader can ask about. */
export type FilterPeriod = (typeof FILTER_PERIODS)[number];

/** The days a period covers, both ends included. */
export type PeriodRange = { start: Date; end: Date };

/** Whether a string is one of the periods, for a value arriving from outside. */
export function isFilterPeriod(value: unknown): value is FilterPeriod {
	return FILTER_PERIODS.includes(value as FilterPeriod);
}

/**
 * The UTC days a period covers, relative to when it is being asked.
 *
 * `now` is passed in rather than read: a router reads it from the clock on its context, which is
 * what lets a test say *what does last month mean on this day* without waiting for one to pass.
 *
 * The month ends are computed as day zero of the following month, which is the last day of this
 * one whether it has 28, 29, 30 or 31 — so February needs no case of its own.
 */
export function toPeriodRange(period: FilterPeriod, now: DateLike): PeriodRange {
	const today = toUtcDay(now);
	const year = today.getUTCFullYear();
	const month = today.getUTCMonth();

	switch (period) {
		case 'this-month':
			return {
				start: new Date(Date.UTC(year, month, 1)),
				end: new Date(Date.UTC(year, month + 1, 0))
			};
		case 'last-month':
			return {
				start: new Date(Date.UTC(year, month - 1, 1)),
				end: new Date(Date.UTC(year, month, 0))
			};
		case 'this-year':
			return {
				start: new Date(Date.UTC(year, 0, 1)),
				end: new Date(Date.UTC(year, 11, 31))
			};
		case 'last-year':
			return {
				start: new Date(Date.UTC(year - 1, 0, 1)),
				end: new Date(Date.UTC(year - 1, 11, 31))
			};
	}
}

/**
 * The one condition that decides whether a stored date falls inside a period, as a query holds it.
 *
 * **It exists so that two surfaces cannot disagree.** The landing screen's collected figure and
 * a contract's payment statement are read by two different routers, and the whole of acceptance
 * criterion 6 of #529 is that asked about one period they report the same money. Two
 * `where` clauses written to the same intention are two chances to write it differently, and the
 * way they would differ is not obvious, because both would look right.
 *
 * **Half-open at the top.** A period's end is a whole UTC day and a payment is stored with
 * whatever time of day it was given, so `date <= end` silently drops every payment made after
 * midnight on the last day of the span. That was the shape the dashboard's own figure had before
 * this condition: correct on most days, and quietly short on the last day of every month.
 */
export function isWithinPeriod(column: AnyColumn, period: FilterPeriod, now: DateLike): SQL {
	const { start, end } = toPeriodRange(period, now);

	return and(gte(column, start), lt(column, addUtcDays(end, 1))) as SQL;
}
