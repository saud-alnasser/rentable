/**
 * DATE
 *
 * UTC-day arithmetic shared by the domain and presentation layers. All derived state
 * compares dates at day granularity in UTC, so normalisation lives in exactly one place.
 */

export type DateLike = Date | number;

/** truncates a timestamp to the start of its UTC day. */
export function toUtcDay(value: DateLike) {
	const date = value instanceof Date ? value : new Date(value);

	return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function addUtcDays(value: Date, days: number) {
	return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate() + days));
}

/** whether a date falls inside a UTC-day range, both ends included. */
export function isWithinUtcRange(value: Date, rangeStart: Date, rangeEnd: Date) {
	const normalizedValue = toUtcDay(value).getTime();

	return normalizedValue >= rangeStart.getTime() && normalizedValue <= rangeEnd.getTime();
}

/** the UTC calendar month containing a timestamp, with the label a reader sees. */
export function getCurrentMonthBounds(now: DateLike) {
	const today = toUtcDay(now);
	const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
	const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0));

	return {
		start,
		end,
		label: new Intl.DateTimeFormat('en-US', {
			month: 'long',
			year: 'numeric',
			timeZone: 'UTC'
		}).format(start)
	};
}

/** advances by calendar months, clamping to the last day of shorter months. */
export function addUtcMonths(value: DateLike, months: number) {
	const date = toUtcDay(value);
	const targetMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
	const year = targetMonth.getUTCFullYear();
	const month = targetMonth.getUTCMonth();
	const lastDayOfMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

	return new Date(Date.UTC(year, month, Math.min(date.getUTCDate(), lastDayOfMonth)));
}
