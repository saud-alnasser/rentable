import assert from 'node:assert/strict';
import test from 'node:test';

import { isDirty } from '../dirty.ts';

/**
 * WHETHER A FORM HAS CHANGES
 *
 * Ticket 08 of [[efforts/861-the-app-never-shows-something-false/spec]], requirement 10: a form
 * that is not a superform compares what it held when it opened with what it holds now. Both sides
 * are `$state.snapshot`s, so what is compared here is plain data, built fresh on each side the
 * way two snapshots are: equal values that are never the same object.
 */

const opened = () => ({
	name: 'ada',
	roleId: 'member',
	override: 0,
	checked: ['m-1', 'm-2'],
	tailoring: { access: 'full-access', pinned: 0, granted: 0 }
});

test('what the form opened on is not a change', () => {
	assert.equal(isDirty(opened(), opened()), false);
	assert.equal(isDirty('', ''), false);
	assert.equal(isDirty(4, 4), false);
});

test('a changed value anywhere in it is a change', () => {
	assert.equal(isDirty(opened(), { ...opened(), name: 'ada l' }), true);
	assert.equal(isDirty(opened(), { ...opened(), override: 8 }), true);
	assert.equal(isDirty(opened(), { ...opened(), checked: ['m-1'] }), true);
	assert.equal(isDirty(opened(), { ...opened(), checked: ['m-2', 'm-1'] }), true);
	assert.equal(
		isDirty(opened(), {
			...opened(),
			tailoring: { access: 'full-access', pinned: 4, granted: 4 }
		}),
		true
	);
	assert.equal(isDirty('', 's'), true);
});

test('a value changed and then changed back is no change', () => {
	const now = opened();

	now.name = 'grace';
	now.checked.push('m-3');
	now.tailoring.pinned = 4;
	assert.equal(isDirty(opened(), now), true);

	now.name = 'ada';
	now.checked.pop();
	now.tailoring.pinned = 0;
	assert.equal(isDirty(opened(), now), false);
});

test('a record whose keys came back in another order is no change', () => {
	assert.equal(isDirty({ a: 'none', b: 'read-only' }, { b: 'read-only', a: 'none' }), false);
});

test('a key set to nothing reads as one never set', () => {
	assert.equal(isDirty({ a: 1 }, { a: 1, b: undefined }), false);
	assert.equal(isDirty({ a: 1 }, { a: 1, b: 0 }), true);
});

test('nothing taken yet is not what any form holds', () => {
	assert.equal(isDirty(undefined, opened()), true);
	assert.equal(isDirty(null, {}), true);
	assert.equal(isDirty([], {}), true);
});
