import assert from 'node:assert/strict';
import test from 'node:test';

import { i18nObject } from '../../i18n/i18n-util.ts';
import { loadLocale } from '../../i18n/i18n-util.sync.ts';
import {
	BUILT_IN,
	WRITE_FLAGS,
	effectiveIn,
	effectiveInWorkspace,
	maskOf,
	permits,
	type Flag
} from '@rentable/workspace-permission';

import {
	administrationHeld,
	firstUnheldMoved,
	holdersWritingBlind,
	levelOf,
	memberWritesOf,
	newRoleMask,
	firstUnheldPinned,
	firstUnheldTailored,
	isTailored,
	pinnedAcross,
	readOnlyTailoring,
	recordsOf,
	roleLine,
	resetTailoring,
	tailoredShown,
	tailoredTo,
	type KindLevel,
	type WorkspaceTailoring
} from '../role.ts';

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

/**
 * WHAT ONE WORKSPACE'S SWITCHES COME TO
 *
 * Requirement 12 of [[efforts/838-permissions-are-a-role-and-an-override/spec]] as amended a third
 * time (ticket 54), and at review round one (ticket 55): the card draws what a member may do in a
 * workspace and hands up the grant and what is pinned there. A switch turned is pinned to its new
 * value, and holds it when what the member may do across the organization moves under it. What is
 * drawn is what the member then holds there, by the package's own arithmetic, and a grant minted
 * read only is granted full access again only where a write is turned on.
 */
const MEMBER = BUILT_IN.member.mask;
const MEMBER_WRITES = maskOf(...WRITE_FLAGS.filter((flag) => permits(MEMBER, flag)));
const EVERY_WRITE = maskOf(...WRITE_FLAGS);
const VIEWS = recordsOf(MEMBER) - MEMBER_WRITES;
const NOTHING: WorkspaceTailoring = { access: 'full-access', pinned: 0, granted: 0 };

test('what a workspace comes to is what the member then holds there, and what was turned is pinned', () => {
	for (const shown of [
		recordsOf(MEMBER),
		VIEWS,
		recordsOf(MEMBER) + maskOf('deletePayment'),
		recordsOf(MEMBER) - maskOf('viewUnit', 'createUnit', 'editUnit')
	]) {
		const next = tailoredTo(MEMBER, NOTHING, NOTHING, shown);

		assert.equal(next.access, 'full-access');
		assert.equal(tailoredShown(MEMBER, next), shown);
		assert.equal(
			recordsOf(effectiveIn(effectiveInWorkspace(MEMBER, next.pinned, next.granted), next.access)),
			shown
		);
	}

	assert.deepEqual(tailoredTo(MEMBER, NOTHING, NOTHING, recordsOf(MEMBER)), NOTHING);

	// deleting payments turned on pins it on, and nothing else.
	const deleting = tailoredTo(
		MEMBER,
		NOTHING,
		NOTHING,
		recordsOf(MEMBER) + maskOf('deletePayment')
	);

	assert.deepEqual(deleting, {
		access: 'full-access',
		pinned: maskOf('deletePayment'),
		granted: maskOf('deletePayment')
	});

	// turned back off, it stays pinned, now off.
	assert.deepEqual(tailoredTo(MEMBER, NOTHING, deleting, recordsOf(MEMBER)), {
		access: 'full-access',
		pinned: maskOf('deletePayment'),
		granted: 0
	});

	// a view turned off pins its writes off with it.
	assert.deepEqual(
		tailoredTo(
			MEMBER,
			NOTHING,
			NOTHING,
			recordsOf(MEMBER) - maskOf('viewUnit', 'createUnit', 'editUnit')
		),
		{ access: 'full-access', pinned: maskOf('viewUnit', 'createUnit', 'editUnit'), granted: 0 }
	);
});

test('read only pins every add, edit and delete off, and holds when the organization moves', () => {
	const readOnly = readOnlyTailoring(NOTHING, NOTHING);

	assert.deepEqual(readOnly, { access: 'full-access', pinned: EVERY_WRITE, granted: 0 });
	assert.equal(tailoredShown(MEMBER, readOnly), VIEWS);
	// a write taken away across the organization, and one the role gains, reach it neither way.
	assert.equal(tailoredShown(MEMBER - maskOf('createPayment'), readOnly), VIEWS);
	assert.equal(tailoredShown(MEMBER + maskOf('deletePayment'), readOnly), VIEWS);

	// a view pinned already stays pinned beside it.
	const viewOff: WorkspaceTailoring = {
		access: 'full-access',
		pinned: maskOf('viewUnit'),
		granted: 0
	};

	assert.deepEqual(readOnlyTailoring(NOTHING, viewOff), {
		access: 'full-access',
		pinned: EVERY_WRITE + maskOf('viewUnit'),
		granted: 0
	});
});

test('a grant minted read only stays read only until a write is turned on', () => {
	const minted: WorkspaceTailoring = { access: 'read-only', pinned: 0, granted: 0 };

	assert.equal(tailoredShown(MEMBER, minted), VIEWS);
	assert.ok(isTailored(MEMBER, minted));
	assert.ok(!isTailored(MEMBER, NOTHING));
	assert.ok(
		isTailored(MEMBER, {
			access: 'full-access',
			pinned: maskOf('viewUnit'),
			granted: maskOf('viewUnit')
		}),
		'a pin that agrees with the organization is still set here'
	);

	// a view off keeps it read only, and pins that kind's writes off with it.
	const viewOff = tailoredTo(MEMBER, minted, minted, VIEWS - maskOf('viewPayment'));

	assert.equal(viewOff.access, 'read-only');
	assert.equal(tailoredShown(MEMBER, viewOff), VIEWS - maskOf('viewPayment'));
	assert.ok(permits(viewOff.pinned, 'viewPayment'));
	assert.ok(!permits(viewOff.granted, 'viewPayment'));

	// a write on is a full-access grant, and every write the grant was clearing is pinned off.
	const writing = tailoredTo(MEMBER, minted, minted, VIEWS + maskOf('createPayment'));

	assert.equal(writing.access, 'full-access');
	assert.equal(tailoredShown(MEMBER, writing), VIEWS + maskOf('createPayment'));
	assert.equal(writing.granted, maskOf('createPayment'));
	assert.equal(writing.pinned, MEMBER_WRITES);

	// the reset is the organization's, which gives the member writes, so full access.
	assert.deepEqual(resetTailoring(MEMBER, minted), NOTHING);
	assert.deepEqual(resetTailoring(maskOf('viewPayment'), minted), {
		access: 'read-only',
		pinned: 0,
		granted: 0
	});
});

test('writing the pins needs every flag they move, and every flag they pin, held', () => {
	const all = BUILT_IN.manager.mask;
	const readOnly = { pinned: MEMBER_WRITES, granted: 0 };
	const nothing = { pinned: 0, granted: 0 };
	const editingPinnedOff = { pinned: maskOf('editPayment'), granted: 0 };

	assert.equal(firstUnheldTailored(all, nothing, readOnly), null);
	assert.equal(firstUnheldTailored(all - maskOf('editPayment'), nothing, readOnly), 'editPayment');
	// pinned and left where it was, still signed under the reader's certificate.
	assert.equal(
		firstUnheldTailored(all - maskOf('editPayment'), editingPinnedOff, {
			pinned: maskOf('editPayment', 'editUnit'),
			granted: 0
		}),
		'editPayment'
	);
	// unpinned is as moved as pinned.
	assert.equal(
		firstUnheldTailored(all - maskOf('editPayment'), editingPinnedOff, nothing),
		'editPayment'
	);
	// a value moved under a pin that stays.
	assert.equal(
		firstUnheldTailored(all - maskOf('editPayment'), editingPinnedOff, {
			pinned: maskOf('editPayment'),
			granted: maskOf('editPayment')
		}),
		'editPayment'
	);
	// nothing changes, so nothing is written, and nothing is asked.
	assert.equal(firstUnheldTailored(0, readOnly, readOnly), null);
});

test('clearing every workspace needs every flag pinned in any of them held', () => {
	const pinned = pinnedAcross([
		{ pinned: maskOf('deleteUnit') },
		{ pinned: maskOf('editPayment', 'deleteUnit') },
		{ pinned: 0 }
	]);

	assert.equal(pinned, maskOf('deleteUnit', 'editPayment'));
	assert.equal(firstUnheldPinned(BUILT_IN.manager.mask, pinned), null);
	assert.equal(firstUnheldPinned(MEMBER, pinned), 'deleteUnit');
	assert.equal(firstUnheldPinned(0, 0), null);
});
