import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
	BUILT_IN,
	effective,
	effectiveIn,
	effectiveInWorkspace,
	firstWriteWithoutView,
	maskOf,
	permits,
	type RecordKind,
	WRITE_FLAGS,
	xorOf
} from '../index.ts';

/**
 * The shared table of cases (criteria 6 and 8 of effort 838).
 *
 * **Read by this test and by Rust's**, `organization/role/permission.rs`, which opens the same file by
 * path. The numbers were computed once, outside either routine, and checked in, so each language
 * is held to the table rather than to the other: a routine that drifts fails on its own side.
 */
type Table = {
	builtIn: Record<keyof typeof BUILT_IN, { id: string; rank: number; mask: number }>;
	cases: { role: string; mask: number; override: number; effective: number; readOnly: number }[];
	workspaceCases: {
		name: string;
		permissions: number;
		pinned: number;
		granted: number;
		effective: number;
		readOnly: number;
	}[];
	writeWithoutView: { name: string; mask: number; kind: RecordKind | null }[];
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

test('every workspace case in the shared table reads the permissions it names there', () => {
	assert.ok(table.workspaceCases.length > 0, 'the table holds no workspace cases');

	for (const {
		name,
		permissions,
		pinned,
		granted,
		effective: expected,
		readOnly
	} of table.workspaceCases) {
		const inWorkspace = effectiveInWorkspace(permissions, pinned, granted);

		assert.equal(inWorkspace, expected, name);
		assert.equal(effectiveIn(inWorkspace, 'full-access'), expected, name);
		assert.equal(effectiveIn(inWorkspace, 'read-only'), readOnly, `${name}, read-only`);
	}
});

test("a workspace override pins record flags and leaves the organization's own alone", () => {
	const manager = BUILT_IN.manager.mask;
	const inWorkspace = effectiveInWorkspace(
		manager,
		maskOf('inviteMember', 'assignRole', 'deleteContract'),
		maskOf('inviteMember')
	);

	assert.equal(permits(inWorkspace, 'inviteMember'), true, 'an administration flag was pinned');
	assert.equal(permits(inWorkspace, 'assignRole'), true, 'an administration flag was pinned');
	assert.equal(permits(inWorkspace, 'deleteContract'), false);
	assert.equal(effectiveInWorkspace(manager, 0, 0), manager, 'nothing pinned changes nothing');
});

test('what is pinned holds its value whichever way the layers beneath it move', () => {
	const readOnly = maskOf(...WRITE_FLAGS);
	const member = BUILT_IN.member.mask;
	const views = effectiveIn(member, 'read-only');

	assert.equal(effectiveInWorkspace(member, readOnly, 0), views);
	assert.equal(
		effectiveInWorkspace(xorOf(member, maskOf('createPayment')), readOnly, 0),
		views,
		'a write taken away across the organization came back'
	);
	assert.equal(
		effectiveInWorkspace(xorOf(member, maskOf('deletePayment')), readOnly, 0),
		views,
		'a write the role gained reached a workspace set read only'
	);
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

test('every case in the shared table names the kind it writes without viewing, or none', () => {
	assert.ok(table.writeWithoutView.length > 0, 'the table holds no such cases');

	for (const { name, mask, kind } of table.writeWithoutView) {
		assert.equal(firstWriteWithoutView(mask), kind, name);
	}
});
