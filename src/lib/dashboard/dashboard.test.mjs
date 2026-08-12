import assert from 'node:assert/strict';
import test from 'node:test';

import {
	DASHBOARD_ENTRIES_PER_RANK,
	isContractIncludedInDashboardPortfolio,
	takeEntriesShownPerRank,
	toDashboardSections
} from './dashboard.ts';

const summaryOf = (rank, contractCount, totalAmount = 0) => ({ rank, contractCount, totalAmount });

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

test('a section takes its rows from the entries and its count from the summary', () => {
	const sections = toDashboardSections(
		[summaryOf('overdue', 9, 4000), summaryOf('owing', 2, 1500)],
		[...entriesOf('overdue', 4), ...entriesOf('owing', 2)]
	);

	assert.deepEqual(
		sections.map(({ summary, entries, hiddenCount }) => ({
			rank: summary.rank,
			shown: entries.length,
			hiddenCount
		})),
		[
			{ rank: 'overdue', shown: 4, hiddenCount: 5 },
			{ rank: 'owing', shown: 2, hiddenCount: 0 }
		]
	);
});

// the sections are the summaries', so the ranks' own order carries through and a rank holding
// nothing — which is summarized as nothing — produces no heading standing over no rows.
test('a rank that holds nothing produces no section', () => {
	assert.deepEqual(toDashboardSections([], entriesOf('overdue', 3)), []);
	assert.deepEqual(
		toDashboardSections([summaryOf('ending-soon', 1)], entriesOf('ending-soon', 1)).map(
			({ summary }) => summary.rank
		),
		['ending-soon']
	);
});

// a count that outran its rows would read as a negative remainder on the screen. It cannot
// happen from the router, and the arithmetic says so rather than trusting that it cannot.
test('a section never states a negative remainder', () => {
	const [section] = toDashboardSections([summaryOf('owing', 1)], entriesOf('owing', 3));

	assert.equal(section.hiddenCount, 0);
});
