import assert from 'node:assert/strict';
import test from 'node:test';

import { planSelection } from '$lib/api/selection.ts';

/** a record with a name, which is the whole of what the shared planner reads off one. */
type Row = { id: string; name: string };
/** a row of the one table the rule turns on, carrying the record it belongs to. */
type Dependant = { ownerId: string };

const records: Row[] = [
	{ id: 'a', name: 'Abraj' },
	{ id: 'b', name: 'Burj' },
	{ id: 'c', name: 'Corniche' }
];

/**
 * The three plans this covers all read the same way: anything holding a dependant is refused.
 * Which table that is, and what the reason is called, is the caller's.
 */
function plan(ids: readonly string[], dependants: readonly Dependant[] = []) {
	return planSelection({
		ids,
		records,
		dependants,
		ownerOf: (dependant) => dependant.ownerId,
		nameOf: (record) => record.name,
		whatRefuses: (held) => (held.length ? ('holds-units' as const) : undefined)
	});
}

// --- What goes through, and what does not ---------------------------------------------

test('a selection nothing refuses goes through whole', () => {
	const { eligible, refused } = plan(['a', 'b']);

	assert.deepEqual(
		eligible.map((record) => record.id),
		['a', 'b']
	);
	assert.deepEqual(refused, []);
});

test('a record holding a dependant is refused, named the way its surface names it', () => {
	const { eligible, refused } = plan(['a', 'b'], [{ ownerId: 'b' }]);

	assert.deepEqual(
		eligible.map((record) => record.id),
		['a']
	);
	assert.deepEqual(refused, [{ id: 'b', name: 'Burj', reason: 'holds-units' }]);
});

test('the rule is asked once per record, with every dependant that record holds', () => {
	const seen: number[] = [];

	planSelection({
		ids: ['a', 'b'],
		records,
		dependants: [{ ownerId: 'b' }, { ownerId: 'b' }, { ownerId: 'c' }],
		ownerOf: (dependant: Dependant) => dependant.ownerId,
		nameOf: (record: Row) => record.name,
		whatRefuses: (held: Dependant[]) => {
			seen.push(held.length);

			return undefined;
		}
	});

	// 'a' holds none and 'b' holds both of its own; 'c' was not selected and is never asked about.
	assert.deepEqual(seen, [0, 2]);
});

// --- The parts that were written out three times --------------------------------------

test('the records are walked in the order the reader named them', () => {
	// not the order the engine answered in, which is what `records` above stands for.
	const { refused } = plan(['c', 'a', 'b'], [{ ownerId: 'a' }, { ownerId: 'b' }, { ownerId: 'c' }]);

	assert.deepEqual(
		refused.map((refusal) => refusal.id),
		['c', 'a', 'b']
	);
});

test('an id named twice is planned once', () => {
	const { eligible } = plan(['a', 'a', 'b']);

	assert.deepEqual(
		eligible.map((record) => record.id),
		['a', 'b']
	);
});

test('an id no record came back for is refused as missing, with nothing to call it by', () => {
	// another device removed it while the reader was deciding, so the row it would have been
	// named from is gone.
	const { eligible, refused } = plan(['a', 'gone']);

	assert.deepEqual(
		eligible.map((record) => record.id),
		['a']
	);
	assert.deepEqual(refused, [{ id: 'gone', name: '', reason: 'missing' }]);
});

test('and a missing record is missing whatever the rule would have said about it', () => {
	// the dependants name an id nothing came back for. The rule is never reached for it, so it
	// cannot be reported as holding something that is no longer there to hold.
	const { refused } = plan(['gone'], [{ ownerId: 'gone' }]);

	assert.deepEqual(refused, [{ id: 'gone', name: '', reason: 'missing' }]);
});

test('an empty selection plans nothing rather than everything', () => {
	assert.deepEqual(plan([]), { eligible: [], refused: [] });
});
