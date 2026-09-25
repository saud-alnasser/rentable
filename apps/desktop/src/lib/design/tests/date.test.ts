import { DateFormatter, parseDate } from '@internationalized/date';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { sourceFiles } from '#tests/source.ts';

import {
	formatCalendarDate,
	formatDateInput,
	formatRecordDateRange,
	joinDateRange,
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

// ticket 28 of effort 832: a period reads with the en dash everywhere, the record header and the
// lists alike, because every surface writes one through `joinDateRange`.
test('a period is written with an en dash between its ends', () => {
	assert.equal(joinDateRange('Jan 1, 2026', 'Dec 31, 2026'), 'Jan 1, 2026 – Dec 31, 2026');
	assert.equal(
		formatRecordDateRange('en', Date.UTC(2026, 0, 1), Date.UTC(2026, 11, 31)),
		'1 Jan 2026 – 31 Dec 2026'
	);
});

test('no surface joins the two ends of a period itself', () => {
	// a dash between two interpolations or two elements: `${a} – ${b}`, `/> – <`.
	const joined = /[}>]\s*[–—]\s*[$<{]/;
	const offenders = sourceFiles(/\.(svelte|ts)$/)
		.filter(({ label }) => label.startsWith('lib/') && label !== 'lib/design/date.ts')
		.filter(({ file }) =>
			readFileSync(file, 'utf8')
				.split('\n')
				.some((line) => joined.test(line) && /date|start|end|period/i.test(line))
		)
		.map(({ label }) => label);

	assert.deepEqual(offenders, [], 'join a period with joinDateRange in design/date.ts');
});
