import assert from 'node:assert/strict';
import test from 'node:test';

import { i18nObject } from '../../../i18n/i18n-util.ts';
import { loadLocale } from '../../../i18n/i18n-util.sync.ts';
import {
	BUILT_IN,
	FAMILIES,
	RECORD_FLAGS,
	maskOf,
	permits,
	type Flag
} from '@rentable/workspace-permission';

import {
	administrationHeld,
	firstUnheldMoved,
	holdersWritingBlind,
	levelOf,
	newRoleMask,
	flagSays,
	roleLine,
	type KindLevel
} from '../role.ts';
import { recordsOf } from '../../access/access.ts';

/**
 * A ROLE'S LEVEL PER KIND OF RECORD, AND THE ONE LINE ITS CARD SAYS
 *
 * Requirement 12 of [[efforts/838-permissions-are-a-role-and-an-override/spec]] as amended a
 * fourth time: a role card says what the role can do in one plain line, built from a step on a
 * ladder per kind, where each step is the one below and one verb more. Every one of a kind's
 * sixteen masks is walked, so a mix off the ladder is seen to read as its verbs rather than be
 * rounded to a step it is not.
 */

loadLocale('en');
loadLocale('ar');

const en = i18nObject('en');
const ar = i18nObject('ar');

const TENANT: readonly Flag[] = ['viewTenant', 'createTenant', 'editTenant', 'deleteTenant'];
const PAYMENT: readonly Flag[] = ['viewPayment', 'createPayment', 'editPayment', 'deletePayment'];

const masked = (flags: readonly Flag[]) => flags.reduce((mask, flag) => mask + maskOf(flag), 0);

/** a role the organization made, carrying these flags alone. */
const custom = (flags: readonly Flag[]) => ({ kind: 'custom' as const, mask: masked(flags) });

test('each step on the ladder is its own level, and nothing is none', () => {
	const steps: [readonly Flag[], KindLevel][] = [
		[[], 'none'],
		[TENANT.slice(0, 1), 'view'],
		[TENANT.slice(0, 2), 'add'],
		[TENANT.slice(0, 3), 'edit'],
		[TENANT, 'full']
	];

	for (const [flags, level] of steps) {
		assert.equal(levelOf(masked(flags), 'tenant'), level, flags.join(' '));
	}
});

test('every other mix is off the ladder', () => {
	const onLadder = new Set([0, 1, 3, 7, 15]);

	for (let bits = 0; bits < 16; bits++) {
		const flags = TENANT.filter((_, index) => bits & (1 << index));

		if (onLadder.has(bits)) continue;

		assert.equal(levelOf(masked(flags), 'tenant'), 'mixed', flags.join(' '));
	}
});

test('the level reads one kind and none of the others', () => {
	const mask = masked(['viewTenant', 'createTenant', 'viewPayment']);

	assert.equal(levelOf(mask, 'tenant'), 'add');
	assert.equal(levelOf(mask, 'payment'), 'view');
	assert.equal(levelOf(mask, 'complex'), 'none');
});

test('the roles every organization has each read as one line', () => {
	assert.equal(
		roleLine(en, 'en', { kind: 'owner', mask: BUILT_IN.owner.mask }),
		'full access to everything'
	);
	assert.equal(
		roleLine(en, 'en', { kind: 'manager', mask: BUILT_IN.manager.mask }),
		'full access to every record, runs the organization'
	);
	assert.equal(
		roleLine(en, 'en', { kind: 'member', mask: BUILT_IN.member.mask }),
		'edits every record'
	);
});

test("a role's line says each step it stands on, widest first, and leaves out what it cannot see", () => {
	assert.equal(
		roleLine(en, 'en', custom(['viewTenant', 'createTenant', 'viewPayment', 'createPayment'])),
		'views and adds tenants and payments'
	);
	assert.equal(
		roleLine(
			en,
			'en',
			custom([
				'viewContract',
				'viewComplex',
				'createComplex',
				'editComplex',
				'deleteComplex',
				'viewUnit',
				'createUnit',
				'editUnit',
				'viewTenant',
				'createTenant',
				'inviteMember',
				'manageRoles'
			])
		),
		'full access to complexes, edits units, views and adds tenants, views contracts, helps run the organization'
	);
});

test('what a role holds of every kind it does not name otherwise reads as every other record', () => {
	assert.equal(
		roleLine(
			en,
			'en',
			custom(['viewComplex', 'viewUnit', 'viewTenant', 'viewContract', ...PAYMENT])
		),
		'full access to payments, views every other record'
	);
	// one kind left is named, since "every other record" would say no more in more words.
	assert.equal(
		roleLine(en, 'en', custom(['viewContract', ...PAYMENT])),
		'full access to payments, views contracts'
	);
});

test('a mix off the ladder reads as the verbs it carries, and a write without its view too', () => {
	assert.equal(
		roleLine(en, 'en', custom(['viewTenant', 'deleteTenant', 'viewPayment', 'deletePayment'])),
		'views and deletes tenants and payments'
	);
	// a write stored without its view, before view was needed, is named rather than hidden.
	assert.equal(roleLine(en, 'en', custom(['editTenant'])), 'edits tenants');
});

test('a role of the organization alone says only that, and a role of nothing says so', () => {
	assert.equal(
		roleLine(en, 'en', {
			kind: 'custom',
			mask: BUILT_IN.manager.mask - recordsOf(BUILT_IN.manager.mask)
		}),
		'runs the organization'
	);
	assert.equal(roleLine(en, 'en', custom([])), en.organization.roleList.carriesNothing());
});

test('in Arabic, the line is written in Arabic, the kinds named as a verb takes them', () => {
	assert.equal(
		roleLine(ar, 'ar', { kind: 'owner', mask: BUILT_IN.owner.mask }),
		ar.organization.roleCard.everything()
	);
	assert.equal(
		roleLine(ar, 'ar', { kind: 'member', mask: BUILT_IN.member.mask }),
		'يعدّل كل السجلات'
	);
	assert.equal(
		roleLine(ar, 'ar', { kind: 'manager', mask: BUILT_IN.manager.mask }),
		'وصول كامل إلى كل السجلات ويدير المؤسسة'
	);
	assert.equal(
		roleLine(ar, 'ar', custom(['viewTenant', 'createTenant', 'viewPayment', 'createPayment'])),
		'يعرض ويضيف المستأجرين والمدفوعات'
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

test('each permission says what it allows, in both languages', () => {
	for (const locale of ['en', 'ar'] as const) {
		loadLocale(locale);
		const t = i18nObject(locale);

		for (const flag of [...RECORD_FLAGS, ...FAMILIES.administration]) {
			assert.ok(flagSays(t, flag).length > 0, `${locale} says nothing for ${flag}`);
		}

		assert.equal(flagSays(t, 'editContract'), t.organization.switches.flagSays.editContract());
		assert.equal(flagSays(t, 'editUnit'), t.organization.switches.verbSays.edit());
	}
});
