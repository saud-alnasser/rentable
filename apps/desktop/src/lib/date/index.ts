/**
 * The date capability: UTC-day arithmetic, the bridge to the calendar widget, how a date and a
 * period read, and the periods a reader can ask about. This file is its whole API; a concept
 * imports `$lib/date` and never a file inside it.
 */
export { addUtcDays, addUtcMonths, toUtcDay, type DateLike } from './date';
export {
	formatCalendarDate,
	formatDateInput,
	formatRecordDateRange,
	fromIsoDay,
	joinDateRange,
	parseCalendarDate,
	parseDateInput,
	toCalendarDate
} from './calendar';
export {
	FILTER_PERIODS,
	isFilterPeriod,
	isWithinPeriod,
	toPeriodRange,
	type FilterPeriod,
	type PeriodRange
} from './period';
export { formatRecordDate } from '$lib/platform/locale';
