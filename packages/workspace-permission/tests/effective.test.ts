import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { BUILT_IN, effective, effectiveIn, maskOf, permits } from '../index.ts';

/**
 * The shared table of cases (criteria 6 and 8 of effort 838).
 *
 * **Read by this test and by Rust's**, `organization/permission.rs`, which opens the same file by
 * path. The numbers were computed once, outside either routine, and checked in, so each language
 * is held to the table rather than to the other: a routine that drifts fails on its own side.
 */
type Table = {
	builtIn: Record<keyof typeof BUILT_IN, { id: string; rank: number; mask: number }>;
	cases: { role: string; mask: number; override: number; effective: number; readOnly: number }[];
};

const table = JSON.parse(
	readFileSync(new URL('./effective.json', import.meta.url), 'utf8')
) as Table;

test('the built-in roles are the ones the shared table holds', () => {
	assert.deepEqual(table.builtIn, BUILT_IN);
});

test('every case in the shared table reads the effective permissions it names', () => {
	assert.ok(table.cases.length > 0, 'the table holds no cases');

	for (const { role, mask, override, effective: expected, readOnly } of table.cases) {
		assert.equal(effective(mask, override), expected, `${role} with override ${override}`);
		assert.equal(effectiveIn(expected, 'full-access'), expected);
		assert.equal(
			effectiveIn(expected, 'read-only'),
			readOnly,
			`${role} with override ${override}, read-only`
		);
	}
});

test('an override turns a flag off where the role carries it, and on where it does not', () => {
	const member = BUILT_IN.member.mask;

	assert.equal(permits(member, 'editPayment'), true);
	assert.equal(permits(effective(member, maskOf('editPayment')), 'editPayment'), false);

	assert.equal(permits(member, 'deletePayment'), false);
	assert.equal(permits(effective(member, maskOf('deletePayment')), 'deletePayment'), true);

	assert.equal(effective(member, 0), member, 'an empty override changes nothing');
	assert.equal(effective(member, member), 0, 'an override of the whole mask clears it');
});
