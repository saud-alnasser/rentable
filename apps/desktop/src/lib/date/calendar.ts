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
import { formatRecordDate } from '$lib/platform/locale';
import {
	getLocalTimeZone,
	parseDate,
	type CalendarDate,
	type DateFormatter
} from '@internationalized/date';

/**
 * The UTC calendar day `value` falls on, as `YYYY-MM-DD`. It is also how a file spells a day:
 * the machine form, which is what every reader agrees on.
 */
export const formatDateInput = (value: number | Date) =>
	(value instanceof Date ? value : new Date(value)).toISOString().slice(0, 10);

/** A `YYYY-MM-DD` calendar day as epoch milliseconds at UTC midnight. */
export const parseDateInput = (value: string) => {
	const [year, month, day] = value.split('-').map(Number);

	return Date.UTC(year, month - 1, day);
};

/**
 * The day a file spells, as the instant the workspace holds, or nothing where it is not a day.
 *
 * Not `parseDateInput`, which trusts a value the date control produced. This one reads a cell
 * somebody typed, so it trims, refuses anything but `YYYY-MM-DD`, and answers `undefined` rather
 * than a number for a value the calendar cannot place.
 */
export function fromIsoDay(value: string) {
	const day = value.trim();

	if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
		return undefined;
	}

	const parsed = Date.parse(`${day}T00:00:00.000Z`);

	return Number.isNaN(parsed) ? undefined : parsed;
}

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
 * A period, its two ends already written, as every surface here writes one: an en dash with a
 * space either side. The en dash is the mark for a range, and the em dash already means "nothing
 * here" wherever a value is missing, so a period written with one read as two different things
 * on the record header and in the list.
 */
export const joinDateRange = (from: string, to: string) => `${from} – ${to}`;

/** A stored period as every surface here renders one, each end the way `formatRecordDate` has it. */
export const formatRecordDateRange = (
	locale: Locales,
	start: number | string | Date,
	end: number | string | Date
) => joinDateRange(formatRecordDate(locale, start), formatRecordDate(locale, end));
