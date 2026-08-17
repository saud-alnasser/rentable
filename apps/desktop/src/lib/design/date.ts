/**
 * The bridge between the two representations of a date this application holds:
 * epoch milliseconds at UTC midnight, which is how a date is stored and how the
 * domain reasons about one, and the calendar widget's own `CalendarDate`.
 *
 * Both directions go through the `YYYY-MM-DD` calendar day rather than through a
 * timestamp, because a date here means a day and not an instant — converting via
 * the local zone would move it across a boundary for anyone east or west of UTC.
 */
import type { Locales } from '$lib/i18n/i18n-types';
import { formatLocaleDate } from '$lib/platform/locale';
import {
	getLocalTimeZone,
	parseDate,
	type CalendarDate,
	type DateFormatter
} from '@internationalized/date';

/** The UTC calendar day `value` falls on, as `YYYY-MM-DD`. */
export const formatDateInput = (value: number | Date) =>
	(value instanceof Date ? value : new Date(value)).toISOString().slice(0, 10);

/** A `YYYY-MM-DD` calendar day as epoch milliseconds at UTC midnight. */
export const parseDateInput = (value: string) => {
	const [year, month, day] = value.split('-').map(Number);

	return Date.UTC(year, month - 1, day);
};

/**
 * A `YYYY-MM-DD` calendar day as a `CalendarDate`, or `undefined` when the value
 * is empty or is not a date. A form holds an unparsed string while it is being
 * filled in, so refusing one is ordinary rather than exceptional.
 */
export const parseCalendarDate = (value: string): CalendarDate | undefined => {
	if (!value) return undefined;

	try {
		return parseDate(value);
	} catch {
		return undefined;
	}
};

/** A stored date as a `CalendarDate`, passing `undefined` through unchanged. */
export const toCalendarDate = (value: number | Date | undefined) =>
	value === undefined ? undefined : parseDate(formatDateInput(value));

/** A `CalendarDate` as text for the reader's locale, or `placeholder` when there is no date. */
export const formatCalendarDate = (
	value: CalendarDate | undefined,
	formatter: DateFormatter,
	placeholder: string
) => (value ? formatter.format(value.toDate(getLocalTimeZone())) : placeholder);

/**
 * A date as every surface here renders one.
 *
 * Medium style, so a month reads as a word and no locale's numeric order can be mistaken for
 * another's, and UTC, because the domain's days are whole UTC days. It is a function rather
 * than only the cell that shows it, so a file written from a list reads the way the list does.
 */
export const formatRecordDate = (locale: Locales, value: number | string | Date) =>
	formatLocaleDate(locale, value, { dateStyle: 'medium', timeZone: 'UTC' });
