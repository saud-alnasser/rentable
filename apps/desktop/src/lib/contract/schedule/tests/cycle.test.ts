import assert from 'node:assert/strict';
import test from 'node:test';
import {
	countExpectedPaymentsInRange,
	getContractTotalCost,
	getExpectedAmountBy,
	getExpectedAmountInRange,
	hasValidContractPeriodForInterval
} from '../cycle.ts';

test('countExpectedPaymentsInRange counts only installments due inside the provided month', () => {
	assert.equal(
		countExpectedPaymentsInRange(
			{
				status: 'active',
				start: new Date('2026-01-10T00:00:00.000Z'),
				end: new Date('2026-04-09T00:00:00.000Z'),
				interval: '1m',
				cost: 1000
			},
			new Date('2026-02-01T00:00:00.000Z'),
			new Date('2026-02-28T00:00:00.000Z')
		),
		1
	);
});

test('getExpectedAmountInRange returns the scheduled amount due inside the provided range', () => {
	assert.equal(
		getExpectedAmountInRange(
			{
				status: 'active',
				start: new Date('2026-01-10T00:00:00.000Z'),
				end: new Date('2026-04-09T00:00:00.000Z'),
				interval: '1m',
				cost: 1250
			},
			new Date('2026-03-01T00:00:00.000Z'),
			new Date('2026-03-31T00:00:00.000Z')
		),
		1250
	);
});

test('getExpectedAmountInRange excludes installments scheduled later than the range end', () => {
	assert.equal(
		getExpectedAmountInRange(
			{
				status: 'active',
				start: new Date('2026-01-20T00:00:00.000Z'),
				end: new Date('2026-04-19T00:00:00.000Z'),
				interval: '1m',
				cost: 1250
			},
			new Date('2026-02-01T00:00:00.000Z'),
			new Date('2026-02-10T00:00:00.000Z')
		),
		0
	);
});

test('hasValidContractPeriodForInterval accepts calendar-month periods on arbitrary start dates', () => {
	// one whole cycle lands the day before the same day-of-month
	assert.equal(
		hasValidContractPeriodForInterval({
			start: new Date('2026-03-10T00:00:00.000Z'),
			end: new Date('2026-04-09T00:00:00.000Z'),
			interval: '1m'
		}),
		true
	);

	assert.equal(
		hasValidContractPeriodForInterval({
			start: new Date('2026-03-10T00:00:00.000Z'),
			end: new Date('2026-04-08T00:00:00.000Z'),
			interval: '1m'
		}),
		true
	);
});

test('hasValidContractPeriodForInterval rejects periods that are not a whole number of interval cycles', () => {
	assert.equal(
		hasValidContractPeriodForInterval({
			start: new Date('2026-03-10T00:00:00.000Z'),
			end: new Date('2026-04-20T00:00:00.000Z'),
			interval: '1m'
		}),
		false
	);
	assert.equal(
		hasValidContractPeriodForInterval({
			start: new Date('2026-01-01T00:00:00.000Z'),
			end: new Date('2026-04-15T00:00:00.000Z'),
			interval: '3m'
		}),
		false
	);
});

test('hasValidContractPeriodForInterval tolerates end dates within five days of a whole cycle', () => {
	// a whole 1m cycle from 2026-01-12 ends 2026-02-11
	assert.equal(
		hasValidContractPeriodForInterval({
			start: new Date('2026-01-12T00:00:00.000Z'),
			end: new Date('2026-02-06T00:00:00.000Z'),
			interval: '1m'
		}),
		true
	);

	assert.equal(
		hasValidContractPeriodForInterval({
			start: new Date('2026-01-12T00:00:00.000Z'),
			end: new Date('2026-02-05T00:00:00.000Z'),
			interval: '1m'
		}),
		false
	);
});

test('hasValidContractPeriodForInterval accepts longer annual terms on non-first-of-month dates', () => {
	assert.equal(
		hasValidContractPeriodForInterval({
			start: new Date('2026-01-12T00:00:00.000Z'),
			end: new Date('2027-01-06T00:00:00.000Z'),
			interval: '12m'
		}),
		true
	);
});

test('hasValidContractPeriodForInterval rejects periods shorter than the selected interval cycle', () => {
	assert.equal(
		hasValidContractPeriodForInterval({
			start: new Date('2026-01-12T00:00:00.000Z'),
			end: new Date('2026-02-02T00:00:00.000Z'),
			interval: '1m'
		}),
		false
	);

	assert.equal(
		hasValidContractPeriodForInterval({
			start: new Date('2026-01-01T00:00:00.000Z'),
			end: new Date('2026-03-24T00:00:00.000Z'),
			interval: '3m'
		}),
		false
	);

	assert.equal(
		hasValidContractPeriodForInterval({
			start: new Date('2026-01-01T00:00:00.000Z'),
			end: new Date('2026-12-25T00:00:00.000Z'),
			interval: '12m'
		}),
		false
	);
});

/**
 * The claim a rank-filtered query narrows on: what a contract is expected to have paid *by a
 * day* never exceeds what it is expected to pay over its whole term. It is what makes "owes
 * something today" imply "has not settled the total", which is the only part of a money rank a
 * stored column can answer.
 *
 * Swept over every interval and over days before, inside, on and past the term, because the
 * bound has to hold everywhere for a query to rely on it — including where the term does not
 * divide into whole cycles and the total falls back to counting them.
 */
test('what a contract owes by any day never exceeds its whole expected amount', () => {
	const start = Date.UTC(2025, 0, 15);
	const intervals = ['1m', '3m', '6m', '12m'] as const;
	const termsInMonths = [1, 3, 7, 12, 13, 24];

	for (const interval of intervals) {
		for (const months of termsInMonths) {
			const contract = {
				status: 'active' as const,
				start,
				end: Date.UTC(2025, months, 15),
				interval,
				cost: 1000
			};
			const total = getContractTotalCost(contract);

			for (const dayOffset of [-40, 0, 1, 45, 200, 400, 4000]) {
				const now = start + dayOffset * 24 * 60 * 60 * 1000;

				assert.ok(
					getExpectedAmountBy(contract, now) <= total,
					`${interval} over ${months} months, ${dayOffset} days in: ` +
						`${getExpectedAmountBy(contract, now)} exceeds ${total}`
				);
			}
		}
	}
});
