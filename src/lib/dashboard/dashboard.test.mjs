import assert from 'node:assert/strict';
import test from 'node:test';

import {
	DASHBOARD_ENTRIES_PER_RANK,
	isContractIncludedInDashboardPortfolio,
	takeEntriesShownPerRank
} from './dashboard.ts';

const entriesOf = (rank, count) =>
	Array.from({ length: count }, (_, index) => ({ rank, id: `${rank}-${index}` }));

test('dashboard portfolio helper excludes terminated contracts from the live portfolio size', () => {
	assert.equal(isContractIncludedInDashboardPortfolio('active'), true);
	assert.equal(isContractIncludedInDashboardPortfolio('defaulted'), true);
	assert.equal(isContractIncludedInDashboardPortfolio('terminated'), false);
});

test('each rank keeps its first few entries and drops the rest', () => {
	const entries = [...entriesOf('overdue', 9), ...entriesOf('owing', 2)];

	const shown = takeEntriesShownPerRank(entries);

	assert.deepEqual(
		shown.map(({ id }) => id),
		[
			...entriesOf('overdue', DASHBOARD_ENTRIES_PER_RANK).map(({ id }) => id),
			...entriesOf('owing', 2).map(({ id }) => id)
		]
	);
});

// the cap is per rank rather than over the response: a rank full of overdue contracts must not
// crowd the renewals out of the screen entirely.
test('one full rank does not consume the allowance of another', () => {
	const entries = [...entriesOf('overdue', 20), ...entriesOf('ending-soon', 3)];

	const shown = takeEntriesShownPerRank(entries);

	assert.equal(shown.filter(({ rank }) => rank === 'overdue').length, DASHBOARD_ENTRIES_PER_RANK);
	assert.equal(shown.filter(({ rank }) => rank === 'ending-soon').length, 3);
});

test('a rank holding fewer entries than the cap is returned whole', () => {
	const entries = entriesOf('owing', 1);

	assert.deepEqual(takeEntriesShownPerRank(entries), entries);
});
