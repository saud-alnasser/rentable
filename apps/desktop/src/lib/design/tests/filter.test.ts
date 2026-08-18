import assert from 'node:assert/strict';
import test from 'node:test';

import { i18nObject } from '$lib/i18n/i18n-util.ts';
import { loadLocale } from '$lib/i18n/i18n-util.sync.ts';
import {
	PERIOD_FILTER,
	type ChoiceFilter,
	hasAnyFilter,
	toChosenOption,
	toFilterLabel,
	toFilterOptions,
	withFilter
} from '../filter.ts';

// the loaded locale rather than a hand-written stand-in: a label reads the whole of
// `TranslationFunctions`, and the four-key object this used to pass was a shape nothing ever
// hands it. English says the same words, so what is asserted is unchanged.
loadLocale('en');

const translations = i18nObject('en');

/** a concept's own filter: a fixed set of values it defines itself. */
const rankFilter: ChoiceFilter = {
	kind: 'choice',
	id: 'rank',
	label: (t) => t.common.labels.rank(),
	options: [
		{ id: 'overdue', label: () => 'overdue' },
		{ id: 'owing', label: () => 'owing' }
	]
};

test('a choice filter offers exactly the values its concept defined', () => {
	assert.deepEqual(
		toFilterOptions(rankFilter).map((option) => option.id),
		['overdue', 'owing']
	);
});

// a list declares *that* it filters by period, never which periods exist — otherwise two
// surfaces that have to agree about a span of time each carry their own list of spans.
test('a period filter offers the shared vocabulary rather than its own', () => {
	assert.deepEqual(
		toFilterOptions(PERIOD_FILTER).map((option) => option.id),
		['this-month', 'last-month', 'this-year', 'last-year']
	);
});

test('the period filter is one declaration, so two surfaces offering it agree on its id', () => {
	assert.equal(PERIOD_FILTER.id, 'period');
	assert.equal(PERIOD_FILTER.kind, 'period');
});

// the chosen value on the control rather than behind it: a list quietly showing a subset is
// the one way this can mislead.
test('a set filter reads as what it narrows by and what it is narrowed to', () => {
	assert.equal(toFilterLabel(rankFilter, { rank: 'overdue' }, translations), 'attention: overdue');
	assert.equal(
		toFilterLabel(PERIOD_FILTER, { period: 'last-month' }, translations),
		'period: last month'
	);
});

test('and an unset one reads as its own name', () => {
	assert.equal(toFilterLabel(rankFilter, {}, translations), 'attention');
});

test('a value outside the vocabulary is not a chosen option', () => {
	assert.equal(toChosenOption(rankFilter, { rank: 'nonsense' }), undefined);
	assert.equal(toChosenOption(rankFilter, {})?.id, undefined);
	assert.equal(toChosenOption(rankFilter, { rank: 'owing' })?.id, 'owing');
});

test('setting a filter leaves every other one alone', () => {
	assert.deepEqual(withFilter({ period: 'this-year' }, 'rank', 'owing'), {
		period: 'this-year',
		rank: 'owing'
	});
});

// removed rather than blanked, so a selection carries only what is actually narrowing and a
// caller can ask whether a list is filtered at all without knowing what it declared.
test('clearing a filter removes it rather than setting it to nothing', () => {
	const cleared = withFilter({ rank: 'owing', period: 'this-year' }, 'rank', undefined);

	assert.deepEqual(cleared, { period: 'this-year' });
	assert.equal('rank' in cleared, false);
});

test('the selection is a copy, so the one held before the change is unchanged', () => {
	const before = { rank: 'owing' };

	withFilter(before, 'rank', 'overdue');

	assert.deepEqual(before, { rank: 'owing' });
});

test('a list knows whether anything is narrowing it', () => {
	assert.equal(hasAnyFilter({}), false);
	assert.equal(hasAnyFilter({ rank: undefined }), false);
	assert.equal(hasAnyFilter({ rank: 'owing' }), true);
});
