import assert from 'node:assert/strict';
import test from 'node:test';

import { fakeOrganizationSession } from '$lib/platform/tests/testing.ts';
import { maskOf } from '@rentable/workspace-permission';

import {
	SETTINGS_SECTIONS,
	recordOf,
	sectionOf,
	sectionsFor,
	withSection,
	WORKSPACE_PARAM
} from '../section.ts';

/**
 * WHICH SECTIONS A READER IS OFFERED, AND HOW ONE IS ADDRESSED
 *
 * The area is drawn from these three answers, so they are read here rather than through a
 * rendered rail: what the address names, what the address for a section is, and which sections a
 * session carries. `area.svelte.test.ts` reads the same gating on screen.
 *
 * The session comes from the shared fixture, because a hand-written partial is a shape the shell
 * never produces; what each case varies is the permission value, which is the one thing the gate
 * consults.
 */

const at = (search: string) => new URL(`http://localhost/settings${search}`);

test('the seven sections are in requirement 14 order', () => {
	assert.deepEqual(
		[...SETTINGS_SECTIONS],
		['general', 'you', 'members', 'workspaces', 'sync', 'updates', 'diagnostics']
	);
});

test('an address naming a section reads as that section', () => {
	assert.equal(sectionOf(at('?section=members')), 'members');
	assert.equal(sectionOf(at('?section=diagnostics')), 'diagnostics');
});

test('an address naming none, or one that is not a section, reads as general', () => {
	assert.equal(sectionOf(at('')), 'general');
	assert.equal(sectionOf(at('?section=')), 'general');
	assert.equal(sectionOf(at('?section=nowhere')), 'general');
	// the create intent shares the address space and names no section.
	assert.equal(sectionOf(at('?create')), 'general');
});

test('a section address is the settings route carrying that section', () => {
	assert.equal(withSection('members'), '/settings?section=members');
	assert.equal(sectionOf(at('?section=sync')), 'sync');
	assert.equal(withSection('sync'), '/settings?section=sync');
});

// effort 828, requirement 19: a card in the members section opens its record, and an account has
// no page of its own, so the record is named on this section's own address. Whether the id names
// anybody is the section's to answer, since only the section holds the accounts.
test('an address naming a record reads as that record, and the section it is in', () => {
	assert.equal(recordOf(at('?section=members&account=ada')), 'ada');
	assert.equal(sectionOf(at('?section=members&account=ada')), 'members');
	assert.equal(recordOf(at('?section=members')), null);
	assert.equal(recordOf(at('?section=members&account=')), null);
	assert.equal(recordOf(at('?section=members&account=%20')), null);
});

// requirement 21: the workspaces section is a directory of cards too, and it names its records by
// its own word, so a reader carrying an account from the section beside it names no workspace.
test('a workspace is named by its own word, and an account is not one', () => {
	assert.equal(recordOf(at('?section=workspaces&workspace=ws-1'), WORKSPACE_PARAM), 'ws-1');
	assert.equal(sectionOf(at('?section=workspaces&workspace=ws-1')), 'workspaces');
	assert.equal(recordOf(at('?section=workspaces&account=ada'), WORKSPACE_PARAM), null);
	assert.equal(recordOf(at('?section=workspaces&workspace='), WORKSPACE_PARAM), null);
});

// requirement 14, on the way in: the area is the one address that draws signed out, and the
// three sections that need no organization are all it can offer there.
test('with nobody signed in, only the sections that need no session are offered', () => {
	assert.deepEqual(sectionsFor(null, false), ['general', 'updates', 'diagnostics']);
	assert.deepEqual(sectionsFor(null, true), ['general', 'updates', 'diagnostics']);
});

test('an owner holding every act is offered all seven, in order', () => {
	const session = fakeOrganizationSession({
		role: 'owner',
		permissions: maskOf(
			'inviteMember',
			'removeMember',
			'changeRole',
			'renameWorkspace',
			'resetPassword',
			'renameMember',
			'grantWorkspace'
		)
	});

	assert.deepEqual(sectionsFor(session, true), [...SETTINGS_SECTIONS]);
});

test('a member who administers nothing is offered every section but members', () => {
	const session = fakeOrganizationSession({ role: 'member', permissions: 0 });

	assert.deepEqual(sectionsFor(session, true), [
		'general',
		'you',
		'workspaces',
		'sync',
		'updates',
		'diagnostics'
	]);
});

// the gate is any one of the six acts that changes a row, so each of them on its own is enough:
// a member who may only rename people still has a list of people to rename.
test('any single act that changes a member row is enough for the members section', () => {
	for (const act of [
		'inviteMember',
		'removeMember',
		'changeRole',
		'resetPassword',
		'renameMember',
		'grantWorkspace'
	] as const) {
		const session = fakeOrganizationSession({ role: 'member', permissions: maskOf(act) });

		assert.ok(
			sectionsFor(session, true).includes('members'),
			`${act} alone did not reach the members section`
		);
	}
});

// the workspaces section is its own, and renaming a workspace is what it is for; a member
// holding that act and nothing else has no reason to be sent to a list of people.
test('renaming a workspace is not one of them', () => {
	const session = fakeOrganizationSession({
		role: 'member',
		permissions: maskOf('renameWorkspace')
	});

	assert.ok(!sectionsFor(session, true).includes('members'));
});
