import assert from 'node:assert/strict';
import test from 'node:test';

import { FILTER_PERIODS, isFilterPeriod, toPeriodRange } from './period.ts';

/** a period's range, as two `YYYY-MM-DD` strings, which is how a range is read at a glance. */
function rangeOf(period, now) {
	const { start, end } = toPeriodRange(period, now);

	return [start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)];
}

const midMarch = Date.UTC(2026, 2, 17);

test('this month runs from its first day to its last', () => {
	assert.deepEqual(rangeOf('this-month', midMarch), ['2026-03-01', '2026-03-31']);
});

test('last month is the whole of the month before, not thirty days back', () => {
	assert.deepEqual(rangeOf('last-month', midMarch), ['2026-02-01', '2026-02-28']);
});

// the end is computed as day zero of the following month, so a short month needs no case of
// its own — and a leap year is the case that would prove a hard-coded 28 wrong.
test('a short month ends on its own last day, leap year included', () => {
	assert.deepEqual(rangeOf('this-month', Date.UTC(2028, 1, 10)), ['2028-02-01', '2028-02-29']);
	assert.deepEqual(rangeOf('last-month', Date.UTC(2028, 2, 31)), ['2028-02-01', '2028-02-29']);
});

// asked on the first of a month, last month must still be the month before rather than
// wrapping onto the day being asked about.
test('the day within the month does not move what the month covers', () => {
	assert.deepEqual(rangeOf('this-month', Date.UTC(2026, 2, 1)), ['2026-03-01', '2026-03-31']);
	assert.deepEqual(rangeOf('this-month', Date.UTC(2026, 2, 31)), ['2026-03-01', '2026-03-31']);
});

test('january asks about december of the year before', () => {
	assert.deepEqual(rangeOf('last-month', Date.UTC(2026, 0, 9)), ['2025-12-01', '2025-12-31']);
});

test('a year runs from its first day to its last', () => {
	assert.deepEqual(rangeOf('this-year', midMarch), ['2026-01-01', '2026-12-31']);
	assert.deepEqual(rangeOf('last-year', midMarch), ['2025-01-01', '2025-12-31']);
});

// the time of day is not part of the question: a period is whole UTC days at both ends, so the
// same period asked at two moments on one day covers the same span.
test('the time of day it is asked at does not move the range', () => {
	const morning = Date.UTC(2026, 2, 17, 1, 30);
	const night = Date.UTC(2026, 2, 17, 23, 59);

	assert.deepEqual(rangeOf('this-month', morning), rangeOf('this-month', night));
});

test('every period in the vocabulary answers with a range', () => {
	for (const period of FILTER_PERIODS) {
		const { start, end } = toPeriodRange(period, midMarch);

		assert.ok(start.getTime() <= end.getTime(), `${period} ends before it starts`);
	}
});

test('a value from outside is a period only if it is one', () => {
	assert.equal(isFilterPeriod('this-month'), true);
	assert.equal(isFilterPeriod('this-week'), false);
	assert.equal(isFilterPeriod(undefined), false);
});
