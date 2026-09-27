import assert from 'node:assert/strict';
import test from 'node:test';

import { i18nObject } from '../../i18n/i18n-util.ts';
import { loadLocale } from '../../i18n/i18n-util.sync.ts';
import { BUILT_IN, maskOf, type Flag } from '@rentable/workspace-permission';

import { administrationHeld, levelOf, levelWord, type KindLevel } from '../role.ts';

/**
 * A ROLE'S LEVEL, PER KIND OF RECORD
 *
 * Requirement 12 of [[efforts/838-permissions-are-a-role-and-an-override/spec]] as amended
 * 2026-09-27: a role card sums a kind in one word, on a ladder where each step is the one below
 * and one verb more. Every one of a kind's sixteen masks is walked, so a mix off the ladder is
 * seen to read as its verbs rather than be rounded to a step it is not.
 */

loadLocale('en');
loadLocale('ar');

const en = i18nObject('en');
const ar = i18nObject('ar');
const list = new Intl.ListFormat('en', { type: 'unit' });

const TENANT: readonly Flag[] = ['viewTenant', 'createTenant', 'editTenant', 'deleteTenant'];

const masked = (flags: readonly Flag[]) => flags.reduce((mask, flag) => mask + maskOf(flag), 0);

test('each step on the ladder is its own level, and nothing is none', () => {
	const steps: [readonly Flag[], KindLevel, string | null][] = [
		[[], 'none', null],
		[TENANT.slice(0, 1), 'view', 'view only'],
		[TENANT.slice(0, 2), 'add', 'can add'],
		[TENANT.slice(0, 3), 'edit', 'can edit'],
		[TENANT, 'full', 'full access']
	];

	for (const [flags, level, word] of steps) {
		assert.equal(levelOf(masked(flags), 'tenant'), level, flags.join(' '));
		assert.equal(levelWord(en, list, masked(flags), 'tenant'), word, flags.join(' '));
	}
});

test('every other mix is off the ladder and reads as the verbs it carries', () => {
	const onLadder = new Set([0, 1, 3, 7, 15]);

	for (let bits = 0; bits < 16; bits++) {
		const flags = TENANT.filter((_, index) => bits & (1 << index));
		const mask = masked(flags);

		if (onLadder.has(bits)) continue;

		assert.equal(levelOf(mask, 'tenant'), 'mixed', flags.join(' '));
	}

	// view and delete without add is neither view only (it deletes) nor full access (it cannot add).
	assert.equal(
		levelWord(en, list, masked(['viewTenant', 'deleteTenant']), 'tenant'),
		'view, delete'
	);
	// a write stored without its view, before view was needed, is named rather than hidden.
	assert.equal(levelWord(en, list, masked(['editTenant']), 'tenant'), 'edit');
});

test('the level reads one kind and none of the others', () => {
	const mask = masked(['viewTenant', 'createTenant', 'viewPayment']);

	assert.equal(levelOf(mask, 'tenant'), 'add');
	assert.equal(levelOf(mask, 'payment'), 'view');
	assert.equal(levelOf(mask, 'complex'), 'none');
});

test('the built-in roles stand on the ladder in both languages', () => {
	assert.equal(levelWord(en, list, BUILT_IN.manager.mask, 'contract'), 'full access');
	assert.equal(levelWord(en, list, BUILT_IN.member.mask, 'contract'), 'can edit');
	assert.equal(
		levelWord(ar, list, BUILT_IN.member.mask, 'contract'),
		ar.organization.roleCard.edit()
	);
});

test("the organization's flags a role holds are counted, and the owner's are not", () => {
	assert.equal(administrationHeld(BUILT_IN.member.mask), 0);
	assert.equal(administrationHeld(BUILT_IN.manager.mask), 10);
	assert.equal(administrationHeld(BUILT_IN.owner.mask), 10);
	assert.equal(
		administrationHeld(masked(['inviteMember', 'manageRoles', 'lockOut', 'viewTenant'])),
		2
	);
});
