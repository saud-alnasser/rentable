import assert from 'node:assert/strict';
import test from 'node:test';
import {
	PAYMENT_LEDGER_MONTH_FORMAT,
	formatPaymentLedgerMonth,
	paymentLedgerMonths
} from './ledger.ts';

const payment = (year, month, day, amount) => ({ date: Date.UTC(year, month - 1, day), amount });

test('a month group carries the first of its month and what its rows add up to', () => {
	const payments = [payment(2026, 3, 20, 500), payment(2026, 3, 2, 400)];
	const monthOf = paymentLedgerMonths(payments);

	assert.deepEqual(monthOf(payments[0]), {
		key: '2026-03',
		start: Date.UTC(2026, 2, 1),
		total: 900
	});
	assert.deepEqual(monthOf(payments[1]), monthOf(payments[0]));
});

test('each month totals only its own rows', () => {
	const payments = [payment(2026, 3, 20, 500), payment(2026, 2, 28, 400)];
	const monthOf = paymentLedgerMonths(payments);

	assert.equal(monthOf(payments[0]).total, 500);
	assert.equal(monthOf(payments[1]).total, 400);
	assert.equal(monthOf(payments[1]).key, '2026-02');
});

test('a month is a UTC calendar month, so a boundary day belongs to the month it falls in', () => {
	const lastDay = payment(2026, 1, 31, 100);
	const firstDay = payment(2026, 2, 1, 200);
	const monthOf = paymentLedgerMonths([lastDay, firstDay]);

	assert.equal(monthOf(lastDay).key, '2026-01');
	assert.equal(monthOf(firstDay).key, '2026-02');
});

test('a month key sorts as text in the order the dates sort', () => {
	const monthOf = paymentLedgerMonths([payment(2026, 9, 1, 1), payment(2026, 10, 1, 1)]);

	assert.equal(monthOf(payment(2026, 9, 1, 1)).key, '2026-09');
	assert.equal(monthOf(payment(2026, 10, 1, 1)).key, '2026-10');
});

test('a payment outside the set reads its own month and contributes nothing to the total', () => {
	const monthOf = paymentLedgerMonths([payment(2026, 3, 2, 400)]);

	assert.deepEqual(monthOf(payment(2025, 12, 31, 700)), {
		key: '2025-12',
		start: Date.UTC(2025, 11, 1),
		total: 0
	});
});

test('a date arriving as a Date groups the same as the timestamp it stands for', () => {
	const asDate = { date: new Date(Date.UTC(2026, 2, 20)), amount: 500 };
	const monthOf = paymentLedgerMonths([asDate]);

	assert.deepEqual(monthOf(asDate), { key: '2026-03', start: Date.UTC(2026, 2, 1), total: 500 });
});

test('a month is named in the calendar its group was cut in', () => {
	// the pin, stated where removing it is a failing test rather than a silent one: an ICU
	// that prefers Umm al-Qura for ar-SA would otherwise name a Hijri month over a run of
	// rows that was cut on Gregorian boundaries.
	assert.equal(PAYMENT_LEDGER_MONTH_FORMAT.calendar, 'gregory');
});

test('an Arabic month header carries the Gregorian month its rows belong to', () => {
	const month = paymentLedgerMonths([])(payment(2026, 3, 20, 500));
	const label = formatPaymentLedgerMonth('ar', month);

	assert.equal(
		label,
		new Intl.DateTimeFormat('ar-SA', {
			month: 'long',
			year: 'numeric',
			timeZone: 'UTC',
			calendar: 'gregory'
		}).format(new Date(month.start))
	);
	assert.notEqual(
		label,
		new Intl.DateTimeFormat('ar-SA', {
			month: 'long',
			year: 'numeric',
			timeZone: 'UTC',
			calendar: 'islamic-umalqura'
		}).format(new Date(month.start))
	);
});

test('an English month header names the month and its year', () => {
	const month = paymentLedgerMonths([])(payment(2026, 3, 20, 500));

	assert.equal(formatPaymentLedgerMonth('en', month), 'March 2026');
});

test('an empty ledger has no month to look up', () => {
	const monthOf = paymentLedgerMonths([]);

	assert.equal(monthOf(payment(2026, 3, 2, 400)).total, 0);
});
