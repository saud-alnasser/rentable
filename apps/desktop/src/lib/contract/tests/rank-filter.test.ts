import assert from 'node:assert/strict';
import test from 'node:test';

import type { ContractRank } from '../rank.ts';
import {
	CONTRACT_RANK_PARAM,
	RANK_FILTER_ID,
	readContractRank,
	toChosenRank,
	toRankArrivalSelection,
	withContractRank
} from '../rank-filter.ts';

test('the contracts list path carries the rank as a search parameter', () => {
	assert.equal(
		withContractRank('/contracts', 'ending-soon'),
		`/contracts?${CONTRACT_RANK_PARAM}=ending-soon`
	);
});

test('a link built for a rank is read back as that rank', () => {
	for (const rank of ['overdue', 'owing', 'ending-soon'] satisfies ContractRank[]) {
		const url = new URL(withContractRank('/contracts', rank), 'http://localhost');

		assert.equal(readContractRank(url), rank);
	}
});

test('a list reached without the parameter asks for no rank', () => {
	assert.equal(readContractRank(new URL('http://localhost/contracts')), undefined);
	assert.equal(readContractRank(new URL('http://localhost/contracts?create')), undefined);
});

// the parameter is part of a URL a reader can edit, so a value outside the vocabulary leaves
// the list showing everything rather than showing nothing.
test('a rank outside the vocabulary asks for no rank', () => {
	assert.equal(readContractRank(new URL('http://localhost/contracts?rank=overdue-ish')), undefined);
	assert.equal(readContractRank(new URL('http://localhost/contracts?rank=')), undefined);
});

/**
 * THE ARRIVAL IS READ OFF THE URL AND OFF NOTHING ELSE
 *
 * What a contracts list opens narrowed to is decided by the URL it was opened by, and never by
 * what the list is already showing. These are what hold it to that: a consumer handed the
 * current selection would have to read the state it writes, and that is exactly what made the
 * directory's arrival loop until Svelte stopped it with `effect_update_depth_exceeded` (#684).
 */

test('a list opened for a rank opens narrowed to it', () => {
	for (const rank of ['overdue', 'owing', 'ending-soon'] satisfies ContractRank[]) {
		const url = new URL(withContractRank('/contracts', rank), 'http://localhost');
		const selection = toRankArrivalSelection(url);

		assert.deepEqual(selection, { [RANK_FILTER_ID]: rank });
		// and the list reads that selection back as the rank it narrows its own query by, which
		// is what makes the door on the dashboard land on the rank rather than on everything.
		assert.equal(toChosenRank(selection), rank);
	}
});

test('a list opened without a rank opens showing everything', () => {
	assert.deepEqual(toRankArrivalSelection(new URL('http://localhost/contracts')), {});
	assert.deepEqual(toRankArrivalSelection(new URL('http://localhost/contracts?create')), {});
});

// the promise readContractRank already makes, kept where a list acts on it: the parameter is
// part of a URL a reader can edit, so a mistyped rank leaves the list showing everything.
test('a list opened for a rank outside the vocabulary opens showing everything', () => {
	assert.deepEqual(
		toRankArrivalSelection(new URL('http://localhost/contracts?rank=overdue-ish')),
		{}
	);
	assert.deepEqual(toRankArrivalSelection(new URL('http://localhost/contracts?rank=')), {});
});
