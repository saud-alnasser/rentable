import { DateFormatter, parseDate } from '@internationalized/date';
import assert from 'node:assert/strict';
import test from 'node:test';

import {
	formatCalendarDate,
	formatDateInput,
	parseCalendarDate,
	parseDateInput,
	toCalendarDate
} from '../date.ts';

test('a stored date reads as the UTC calendar day it falls on', () => {
	assert.equal(formatDateInput(Date.UTC(2025, 0, 31)), '2025-01-31');
	assert.equal(formatDateInput(new Date(Date.UTC(2025, 11, 1))), '2025-12-01');
});

test('a calendar day parses back to midnight UTC, so the pair round-trips', () => {
	assert.equal(parseDateInput('2025-01-31'), Date.UTC(2025, 0, 31));
	assert.equal(formatDateInput(parseDateInput('2025-06-15')), '2025-06-15');
});

test('a calendar day parses without shifting across a time zone', () => {
	assert.equal(parseCalendarDate('2025-01-31')?.toString(), '2025-01-31');
	assert.equal(toCalendarDate(Date.UTC(2025, 0, 31))?.toString(), '2025-01-31');
});

test('an absent or unparseable date is undefined rather than a thrown error', () => {
	assert.equal(parseCalendarDate(''), undefined);
	assert.equal(parseCalendarDate('not a date'), undefined);
	assert.equal(toCalendarDate(undefined), undefined);
});

test('a date is written for the reader, and its absence shows the placeholder', () => {
	const formatter = new DateFormatter('en-US', { dateStyle: 'medium' });

	assert.equal(
		formatCalendarDate(parseDate('2025-01-31'), formatter, 'pick a date'),
		'Jan 31, 2025'
	);
	assert.equal(formatCalendarDate(undefined, formatter, 'pick a date'), 'pick a date');
});
