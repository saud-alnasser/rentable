import assert from 'node:assert/strict';
import test from 'node:test';

import { i18nObject } from '../../i18n/i18n-util.ts';
import { loadLocale } from '../../i18n/i18n-util.sync.ts';
import { BUILT_IN, maskOf, permits, type Flag } from '@rentable/workspace-permission';

import {
	administrationHeld,
	firstUnheldMoved,
	holdersWritingBlind,
	levelOf,
	levelWord,
	memberWritesOf,
	newRoleMask,
	type KindLevel
} from '../role.ts';

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

// ticket 45 of effort 838: what a card's save sends for the role and the override. A changed role
// carries the override the switches come to, even the one the member had: the shell clears what
// is not sent.
test('a changed role sends the override the switches come to, even the one the member had', () => {
	const may = { canAssignRole: true, canOverride: true };
	const saved = { roleId: 'member', override: maskOf('renameMember') };

	assert.deepEqual(memberWritesOf(saved, { roleId: 'supervisor', override: saved.override }, may), {
		assign: { roleId: 'supervisor', override: maskOf('renameMember') },
		override: null
	});
	// nothing switched sends nothing, which is the role exactly.
	assert.deepEqual(memberWritesOf(saved, { roleId: 'supervisor', override: 0 }, may), {
		assign: { roleId: 'supervisor', override: undefined },
		override: null
	});
	// a reader who may not override sends none with the role.
	assert.deepEqual(
		memberWritesOf(
			saved,
			{ roleId: 'supervisor', override: saved.override },
			{ canAssignRole: true, canOverride: false }
		),
		{ assign: { roleId: 'supervisor', override: undefined }, override: null }
	);
	// the role left as it was: an override written only where it changed.
	assert.deepEqual(memberWritesOf(saved, saved, may), { assign: null, override: null });
	assert.deepEqual(memberWritesOf(saved, { roleId: 'member', override: 0 }, may), {
		assign: null,
		override: 0
	});
});

// requirement 7: a flag moved either way is one the reader must hold.
test('the first flag a change moves that the reader does not hold is named', () => {
	const held = BUILT_IN.manager.mask - maskOf('deletePayment');

	assert.equal(firstUnheldMoved(held, maskOf('deletePayment'), 0), 'deletePayment');
	assert.equal(firstUnheldMoved(held, 0, maskOf('deletePayment')), 'deletePayment');
	assert.equal(firstUnheldMoved(held, maskOf('editPayment'), 0), null);
	assert.equal(firstUnheldMoved(held, maskOf('deletePayment'), maskOf('deletePayment')), null);
});

// a new role opens on the member's flags less the ones its maker does not hold, and a kind whose
// view that leaves out loses its writes with it.
test('a new role opens on the member mask less what its maker does not hold', () => {
	assert.equal(newRoleMask(BUILT_IN.owner.mask), BUILT_IN.member.mask);
	assert.equal(newRoleMask(BUILT_IN.manager.mask), BUILT_IN.member.mask);
	assert.equal(
		newRoleMask(BUILT_IN.member.mask - maskOf('editPayment')),
		BUILT_IN.member.mask - maskOf('editPayment')
	);
	// a maker who holds tenants' writes without their view gives none of the tenants' switches.
	const opened = newRoleMask(BUILT_IN.member.mask - maskOf('viewTenant'));

	assert.deepEqual(
		TENANT.filter((flag) => permits(opened, flag)),
		[]
	);
	assert.ok(permits(opened, 'viewPayment'));
});

// requirement 6 as amended: a holder whose own change adds a write is left writing blind where
// the role's view goes, and one the change leaves as they were is not asked.
test('the holders a new mask leaves writing records they cannot view are named', () => {
	const mask = masked(['viewTenant']);
	const holders = [
		{ username: 'lina', override: maskOf('createTenant') },
		{ username: 'omar', override: 0 },
		{ username: 'sami', override: maskOf('viewTenant', 'createTenant') }
	];

	assert.deepEqual(holdersWritingBlind(holders, mask, 0), ['lina']);
	assert.deepEqual(holdersWritingBlind(holders, mask, mask), []);
	// sami's own change gives him the view the role lacks; the role giving it too takes it away,
	// and leaves his add.
	assert.deepEqual(holdersWritingBlind(holders, 0, mask), ['sami']);
});
