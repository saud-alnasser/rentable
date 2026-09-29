import assert from 'node:assert/strict';
import test from 'node:test';

import { maskOf } from '@rentable/workspace-permission';

import { fakeOrganizationSession } from '$lib/organization/tests/testing.ts';

import { administersMembers, memberWritesOf } from '../member.ts';

/**
 * WHAT A MEMBER'S CARD WRITES, AND WHO IS GIVEN A DIRECTORY OF MEMBERS
 *
 * What one save of a member's card sends for the role and the override (effort 838), and the gate
 * on the members directory (effort 828, requirement 24). Read in `role/tests/role.test.ts` beside
 * what a role is called until effort 840 gave the member a directory of its own.
 */

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

// requirement 24 of effort 828: the gate moved from the section to the block inside it. A member
// who changes nobody's row still reads the sync status, the way out and their own account, so the
// organization section is theirs and the directory is not. *Read in `settings/tests/section.test.ts`
// beside the sections a session is offered until effort 840 moved the gate to the organization.*
test('a member who administers nothing is given no directory', () => {
	const session = fakeOrganizationSession({ role: 'member', permissions: 0 });

	assert.ok(!administersMembers(session));
});

// the gate is any one of the flags that changes a member's row, so each of them on its own is
// enough: a member who may only rename people still has a list of people to rename.
test('any single act that changes a member row is enough for the directory', () => {
	for (const act of [
		'inviteMember',
		'removeMember',
		'assignRole',
		'overrideMember',
		'resetPassword',
		'renameMember',
		'grantWorkspace'
	] as const) {
		const session = fakeOrganizationSession({ role: 'member', permissions: maskOf(act) });

		assert.ok(administersMembers(session), `${act} alone did not reach the members directory`);
	}
});

// the workspaces section is its own, and renaming a workspace is what it is for; a member
// holding that act and nothing else has no reason to be given a list of people.
test('renaming a workspace is not one of them', () => {
	const session = fakeOrganizationSession({
		role: 'member',
		permissions: maskOf('renameWorkspace')
	});

	assert.ok(!administersMembers(session));
	// and nobody at all is one on the way in.
	assert.ok(!administersMembers(null));
});
