import assert from 'node:assert/strict';
import test from 'node:test';

import {
	BUILT_IN,
	WRITE_FLAGS,
	effectiveIn,
	effectiveInWorkspace,
	maskOf,
	permits
} from '@rentable/workspace-permission';

import {
	firstUnheldPinned,
	firstUnheldTailored,
	isTailored,
	pinnedAcross,
	recordsOf,
	tailoredShown,
	tailoredTo,
	type WorkspaceTailoring
} from '../access.ts';

/**
 * WHAT ONE WORKSPACE'S SWITCHES COME TO
 *
 * Requirement 12 of [[efforts/838-permissions-are-a-role-and-an-override/spec]] as amended a third
 * time (ticket 54) and a fourth (ticket 57): the card draws what a member may do in a workspace and
 * hands up the grant and what is pinned there. What is pinned is exactly what the switches differ
 * on from what the member holds across the organization, so a switch turned back is unpinned. What
 * is drawn is what the member then holds there, by the package's own arithmetic, and a grant
 * minted read only is granted full access again only where a write is turned on.
 */
const MEMBER = BUILT_IN.member.mask;
const MEMBER_WRITES = maskOf(...WRITE_FLAGS.filter((flag) => permits(MEMBER, flag)));
const VIEWS = recordsOf(MEMBER) - MEMBER_WRITES;
const NOTHING: WorkspaceTailoring = { access: 'full-access', pinned: 0, granted: 0 };

test('what a workspace comes to is what the member then holds there, and what differs is pinned', () => {
	for (const shown of [
		recordsOf(MEMBER),
		VIEWS,
		recordsOf(MEMBER) + maskOf('deletePayment'),
		recordsOf(MEMBER) - maskOf('viewUnit', 'createUnit', 'editUnit')
	]) {
		const next = tailoredTo(MEMBER, 'full-access', shown);

		assert.equal(next.access, 'full-access');
		assert.equal(tailoredShown(MEMBER, next), shown);
		assert.equal(
			recordsOf(effectiveIn(effectiveInWorkspace(MEMBER, next.pinned, next.granted), next.access)),
			shown
		);
	}

	assert.deepEqual(tailoredTo(MEMBER, 'full-access', recordsOf(MEMBER)), NOTHING);

	// deleting payments turned on pins it on, and nothing else.
	assert.deepEqual(tailoredTo(MEMBER, 'full-access', recordsOf(MEMBER) + maskOf('deletePayment')), {
		access: 'full-access',
		pinned: maskOf('deletePayment'),
		granted: maskOf('deletePayment')
	});

	// a view turned off pins its writes off with it.
	assert.deepEqual(
		tailoredTo(
			MEMBER,
			'full-access',
			recordsOf(MEMBER) - maskOf('viewUnit', 'createUnit', 'editUnit')
		),
		{ access: 'full-access', pinned: maskOf('viewUnit', 'createUnit', 'editUnit'), granted: 0 }
	);
});

test('a switch turned back is no longer pinned, and one the organization moves to is dropped', () => {
	// turned on and back off: what the organization gives, so nothing is set there.
	assert.deepEqual(tailoredTo(MEMBER, 'full-access', recordsOf(MEMBER)), NOTHING);

	// pinned on, then given across the organization: the pin agrees with it, and goes.
	const deleting = tailoredTo(MEMBER, 'full-access', recordsOf(MEMBER) + maskOf('deletePayment'));
	const given = MEMBER + maskOf('deletePayment');

	assert.deepEqual(tailoredTo(given, 'full-access', tailoredShown(given, deleting)), NOTHING);

	// every add, edit and delete turned off is every write the organization gives, pinned off.
	assert.deepEqual(tailoredTo(MEMBER, 'full-access', VIEWS), {
		access: 'full-access',
		pinned: MEMBER_WRITES,
		granted: 0
	});
});

test('a grant minted read only reads with its writes off, and a write on pins the rest off', () => {
	const minted: WorkspaceTailoring = { access: 'read-only', pinned: 0, granted: 0 };

	assert.equal(tailoredShown(MEMBER, minted), VIEWS);
	assert.ok(isTailored(MEMBER, minted));
	assert.ok(!isTailored(MEMBER, NOTHING));

	// nothing turned: it stays as it is, with nothing set there.
	assert.deepEqual(tailoredTo(MEMBER, 'read-only', VIEWS), minted);

	// a view off keeps it read only, and pins that view off alone: its writes are the grant's.
	const viewOff = tailoredTo(MEMBER, 'read-only', VIEWS - maskOf('viewPayment'));

	assert.deepEqual(viewOff, {
		access: 'read-only',
		pinned: maskOf('viewPayment'),
		granted: 0
	});
	assert.equal(tailoredShown(MEMBER, viewOff), VIEWS - maskOf('viewPayment'));

	// a write on is a full-access grant, and every write the grant was clearing differs now, so is
	// pinned off.
	const writing = tailoredTo(MEMBER, 'read-only', VIEWS + maskOf('createPayment'));

	assert.equal(writing.access, 'full-access');
	assert.equal(tailoredShown(MEMBER, writing), VIEWS + maskOf('createPayment'));
	assert.equal(writing.granted, 0);
	assert.equal(writing.pinned, MEMBER_WRITES - maskOf('createPayment'));
});

// a mask stored before a write needed its view: the write the layers carry comes back under a view
// pinned on, so it is pinned off beside it.
test('a write carried without its view stays off when its view is turned on there', () => {
	const blind = maskOf('viewUnit', 'editPayment');
	const shown = maskOf('viewUnit', 'viewPayment');
	const next = tailoredTo(blind, 'full-access', shown);

	assert.equal(tailoredShown(blind, next), shown);
	assert.deepEqual(next, {
		access: 'full-access',
		pinned: maskOf('viewPayment', 'editPayment'),
		granted: maskOf('viewPayment')
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
