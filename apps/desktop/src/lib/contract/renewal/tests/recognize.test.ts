import assert from 'node:assert/strict';
import test from 'node:test';

import { type RecognizableContract, recognizeRenewals } from '$lib/contract/renewal/recognize.ts';

const utc = (year: number, month: number, day: number, hour = 0) =>
	Date.UTC(year, month - 1, day, hour);

/** a year's contract for tenant `t1` ending on the last day of 2025, linked to nothing. */
function contract(id: string, overrides: Partial<RecognizableContract> = {}): RecognizableContract {
	return {
		id,
		tenantId: 't1',
		status: 'active',
		start: utc(2025, 1, 1),
		end: utc(2025, 12, 31),
		renewsContractId: null,
		...overrides
	};
}

/** the contract after it: same tenant, starting the next UTC day. */
function next(id: string, overrides: Partial<RecognizableContract> = {}) {
	return contract(id, {
		status: 'scheduled',
		start: utc(2026, 1, 1),
		end: utc(2026, 12, 31),
		...overrides
	});
}

const units = (entries: Record<string, string[]>) => new Map(Object.entries(entries));

test('a contract starting the day after another ends, on the same tenant and units, renews it', () => {
	const links = recognizeRenewals(
		[contract('p'), next('s')],
		units({ p: ['u1', 'u2'], s: ['u2', 'u1'] })
	);

	assert.deepEqual(links, [{ successorId: 's', predecessorId: 'p' }]);
});

// a stored date is midnight UTC, but one carrying an hour is still the same day: the rule reads
// whole UTC days, as every date in the domain does.
test('the days compare as whole UTC days, not as instants', () => {
	const links = recognizeRenewals(
		[contract('p', { end: utc(2025, 12, 31, 23) }), next('s', { start: utc(2026, 1, 1, 5) })],
		units({ p: ['u1'], s: ['u1'] })
	);

	assert.deepEqual(links, [{ successorId: 's', predecessorId: 'p' }]);
});

test('a contract on a different tenant is not linked', () => {
	const links = recognizeRenewals(
		[contract('p'), next('s', { tenantId: 't2' })],
		units({ p: ['u1'], s: ['u1'] })
	);

	assert.deepEqual(links, []);
});

test('a contract holding different units is not linked', () => {
	const fewer = recognizeRenewals(
		[contract('p'), next('s')],
		units({ p: ['u1', 'u2'], s: ['u1'] })
	);
	const other = recognizeRenewals([contract('p'), next('s')], units({ p: ['u1'], s: ['u2'] }));
	const none = recognizeRenewals([contract('p'), next('s')], units({ p: ['u1'] }));

	assert.deepEqual(fewer, []);
	assert.deepEqual(other, []);
	assert.deepEqual(none, []);
});

test('a contract starting on any day but the next is not linked', () => {
	for (const start of [utc(2025, 12, 31), utc(2026, 1, 2), utc(2025, 6, 1)]) {
		const links = recognizeRenewals(
			[contract('p'), next('s', { start })],
			units({ p: ['u1'], s: ['u1'] })
		);

		assert.deepEqual(links, [], `linked a successor starting ${new Date(start).toISOString()}`);
	}
});

test('a terminated candidate is not linked', () => {
	const links = recognizeRenewals(
		[contract('p'), next('s', { status: 'terminated' })],
		units({ p: ['u1'], s: ['u1'] })
	);

	assert.deepEqual(links, []);
});

// a terminated contract is no candidate at all, so it does not make the one beside it ambiguous.
test('a terminated contract beside a candidate leaves the candidate linked', () => {
	const links = recognizeRenewals(
		[contract('p'), next('gone', { status: 'terminated' }), next('s')],
		units({ p: [], gone: [], s: [] })
	);

	assert.deepEqual(links, [{ successorId: 's', predecessorId: 'p' }]);
});

test('a predecessor two contracts would renew is linked to neither', () => {
	const links = recognizeRenewals(
		[contract('p'), next('s1'), next('s2')],
		units({ p: [], s1: [], s2: [] })
	);

	assert.deepEqual(links, []);
});

test('a successor two contracts would precede is linked to neither', () => {
	const links = recognizeRenewals(
		[contract('p1'), contract('p2', { start: utc(2025, 7, 1) }), next('s')],
		units({ p1: [], p2: [], s: [] })
	);

	assert.deepEqual(links, []);
});

test('a contract that already names one is left alone, even where another matches', () => {
	const links = recognizeRenewals(
		[
			contract('p'),
			contract('elsewhere', { start: utc(2024, 1, 1), end: utc(2024, 12, 31) }),
			next('s', { renewsContractId: 'elsewhere' })
		],
		units({ p: ['u1'], elsewhere: ['u9'], s: ['u1'] })
	);

	assert.deepEqual(links, []);
});

// a written link is never moved, and a predecessor a contract already renews is not given a second.
test('a predecessor a contract already renews is not linked again', () => {
	const links = recognizeRenewals(
		[contract('p'), next('linked', { renewsContractId: 'p' }), next('s')],
		units({ p: [], linked: ['u7'], s: [] })
	);

	assert.deepEqual(links, []);
});

// the link a terminated successor wrote does not renew it (`renewed` is read off successors that
// are not terminated), so the contract that does continue it is linked.
test('a predecessor named only by a terminated contract is linked to the one that matches', () => {
	const links = recognizeRenewals(
		[contract('p'), next('gone', { status: 'terminated', renewsContractId: 'p' }), next('s')],
		units({ p: ['u1'], gone: ['u1'], s: ['u1'] })
	);

	assert.deepEqual(links, [{ successorId: 's', predecessorId: 'p' }]);
});

// the same set of units, which two empty sets are: the match is on tenant and day alone, the
// weaker one the spec accepts (effort 861, *Risks*).
test('two contracts holding no units are linked on tenant and day alone', () => {
	const absent = recognizeRenewals([contract('p'), next('s')], units({}));
	const empty = recognizeRenewals([contract('p'), next('s')], units({ p: [], s: [] }));

	assert.deepEqual(absent, [{ successorId: 's', predecessorId: 'p' }]);
	assert.deepEqual(empty, [{ successorId: 's', predecessorId: 'p' }]);
});

test('a chain of renewals is linked link by link', () => {
	const links = recognizeRenewals(
		[contract('a'), next('b'), contract('c', { start: utc(2027, 1, 1), end: utc(2027, 12, 31) })],
		units({ a: ['u1'], b: ['u1'], c: ['u1'] })
	);

	assert.deepEqual(
		[...links].sort((x, y) => x.successorId.localeCompare(y.successorId)),
		[
			{ successorId: 'b', predecessorId: 'a' },
			{ successorId: 'c', predecessorId: 'b' }
		]
	);
});

test('recognising reads its inputs and changes neither', () => {
	const contracts = [contract('p'), next('s')];
	const held = units({ p: ['u1'], s: ['u1'] });
	const before = structuredClone({ contracts, held: [...held] });

	recognizeRenewals(contracts, held);

	assert.deepEqual({ contracts, held: [...held] }, before);
});
