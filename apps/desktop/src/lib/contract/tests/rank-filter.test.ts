import assert from 'node:assert/strict';
import test from 'node:test';

import type { ContractRank } from '../rank.ts';
import { CONTRACT_RANK_PARAM, readContractRank, withContractRank } from '../rank-filter.ts';

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
