import assert from 'node:assert/strict';
import test from 'node:test';

import { doesRenewalFollowPredecessor, getContractRenewalTerm } from '$lib/contract/renewal.ts';

const utc = (year: number, month: number, day: number) => Date.UTC(year, month - 1, day);

// --- The term a renewal proposes ------------------------------------------------------

test('the successor starts the day after the predecessor ends', () => {
	const term = getContractRenewalTerm({
		start: utc(2025, 1, 1),
		end: utc(2025, 12, 31),
		interval: '12m'
	});

	assert.equal(term.start.getTime(), utc(2026, 1, 1));
});

test('the successor runs for the same number of cycles as the predecessor', () => {
	const term = getContractRenewalTerm({
		start: utc(2025, 1, 1),
		end: utc(2025, 12, 31),
		interval: '3m'
	});

	assert.equal(term.cycles, 4);
	assert.equal(term.end.getTime(), utc(2026, 12, 31));
});

test('a one-cycle predecessor renews into a one-cycle successor', () => {
	const term = getContractRenewalTerm({
		start: utc(2025, 3, 1),
		end: utc(2025, 3, 31),
		interval: '1m'
	});

	assert.equal(term.cycles, 1);
	assert.equal(term.start.getTime(), utc(2025, 4, 1));
	assert.equal(term.end.getTime(), utc(2025, 4, 30));
});

// the predecessor's own end sits five days inside the tolerance window; the proposal is the
// date the interval calculates rather than the one the predecessor happened to carry.
test('the proposed end is the calculated cycle boundary, not an inherited override', () => {
	const term = getContractRenewalTerm({
		start: utc(2025, 1, 1),
		end: utc(2026, 1, 4),
		interval: '12m'
	});

	assert.equal(term.cycles, 1);
	assert.equal(term.start.getTime(), utc(2026, 1, 5));
	assert.equal(term.end.getTime(), utc(2027, 1, 4));
});

test('proposing a term does not alter the contract it was read from', () => {
	const predecessor: Parameters<typeof getContractRenewalTerm>[0] = {
		start: utc(2025, 1, 1),
		end: utc(2025, 12, 31),
		interval: '12m'
	};
	const before = { ...predecessor };

	getContractRenewalTerm(predecessor);

	assert.deepEqual(predecessor, before);
});

// --- Whether a term continues the predecessor or runs alongside it ---------------------

test('a term starting the day after the predecessor ends follows it', () => {
	assert.equal(doesRenewalFollowPredecessor(utc(2025, 12, 31), utc(2026, 1, 1)), true);
});

test('a term starting on the predecessor’s end date does not follow it', () => {
	assert.equal(doesRenewalFollowPredecessor(utc(2025, 12, 31), utc(2025, 12, 31)), false);
});

test('a term starting before the predecessor ends does not follow it', () => {
	assert.equal(doesRenewalFollowPredecessor(utc(2025, 12, 31), utc(2025, 6, 1)), false);
});

// the domain compares whole UTC days, so a time of day inside the day either side of the
// boundary cannot change the answer.
test('following is decided on whole UTC days, never on the time of day', () => {
	const predecessorEnd = utc(2025, 12, 31) + 23 * 60 * 60 * 1000;
	const successorStart = utc(2026, 1, 1) + 1 * 60 * 60 * 1000;

	assert.equal(doesRenewalFollowPredecessor(predecessorEnd, successorStart), true);
	assert.equal(doesRenewalFollowPredecessor(predecessorEnd, utc(2025, 12, 31)), false);
});
