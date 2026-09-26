import assert from 'node:assert/strict';
import test from 'node:test';

import { fakeOrganizationSession } from '$lib/platform/tests/testing.ts';
import { maskOf } from '@rentable/workspace-permission';

import {
	SECTION_HOLDING,
	SETTINGS_SECTIONS,
	administersMembers,
	holdingSection,
	recordOf,
	sectionOf,
	sectionsFor,
	withSection,
	WORKSPACE_PARAM
} from '../section.ts';

/**
 * WHICH SECTIONS A READER IS OFFERED, AND HOW ONE IS ADDRESSED
 *
 * The area is drawn from these answers, so they are read here rather than through a rendered
 * rail: what the address names, what the address for a section is, which of the four holds a name
 * that is gone, and which sections a session carries. `area.svelte.test.ts` reads the same gating
 * on screen.
 *
 * The session comes from the shared fixture, because a hand-written partial is a shape the shell
 * never produces; what each case varies is the permission value, which is the one thing the gate
 * consults.
 */

const at = (search: string) => new URL(`http://localhost/settings${search}`);

// requirement 24 of effort 828: four sections, each named for what it holds, in the order the
// rail draws them.
test('the four sections are in the order the area presents them', () => {
	assert.deepEqual([...SETTINGS_SECTIONS], ['general', 'account', 'organization', 'workspaces']);
});

test('an address naming a section reads as that section', () => {
	assert.equal(sectionOf(at('?section=organization')), 'organization');
	assert.equal(sectionOf(at('?section=account')), 'account');
});

// requirement 24: an address outlives the arrangement that made it, so every word a section used
// to go by names the section that holds what it held.
test('each retired name is held by one of the four', () => {
	assert.deepEqual(SECTION_HOLDING, {
		you: 'account',
		members: 'organization',
		sync: 'organization',
		updates: 'general',
		diagnostics: 'general'
	});

	assert.equal(holdingSection('you'), 'account');
	assert.equal(holdingSection('members'), 'organization');
	assert.equal(holdingSection('sync'), 'organization');
	assert.equal(holdingSection('updates'), 'general');
	assert.equal(holdingSection('diagnostics'), 'general');
	// and one of the four is held by itself, so one call answers either word.
	assert.equal(holdingSection('workspaces'), 'workspaces');
});

test('an address naming a retired section reads as the section that holds it', () => {
	assert.equal(sectionOf(at('?section=you')), 'account');
	assert.equal(sectionOf(at('?section=members')), 'organization');
	assert.equal(sectionOf(at('?section=sync')), 'organization');
	assert.equal(sectionOf(at('?section=updates')), 'general');
	assert.equal(sectionOf(at('?section=diagnostics')), 'general');
});

test('an address naming none, or one that is not a section, reads as general', () => {
	assert.equal(sectionOf(at('')), 'general');
	assert.equal(sectionOf(at('?section=')), 'general');
	assert.equal(sectionOf(at('?section=nowhere')), 'general');
	// the create intent shares the address space and names no section.
	assert.equal(sectionOf(at('?create')), 'general');
});

test('a section address is the settings route carrying that section', () => {
	assert.equal(withSection('organization'), '/settings?section=organization');
	assert.equal(withSection('general'), '/settings?section=general');
});

// and a caller still holding an old word is written the live address rather than the dead one, so
// nothing this writes sends a reader through the reading above.
test('a retired name writes the address of the section that holds it', () => {
	assert.equal(withSection('you'), '/settings?section=account');
	assert.equal(withSection('sync'), '/settings?section=organization');
	assert.equal(withSection('diagnostics'), '/settings?section=general');
});

// effort 828, requirement 19: a card in the members directory opens its record, and a member has
// no page of their own, so the record is named on its section's own address. Whether the id names
// anybody is the section's to answer, since only the section holds the rows.
test('an address naming a record reads as that record, and the section it is in', () => {
	assert.equal(recordOf(at('?section=organization&member=ada')), 'ada');
	assert.equal(sectionOf(at('?section=organization&member=ada')), 'organization');
	assert.equal(recordOf(at('?section=organization')), null);
	assert.equal(recordOf(at('?section=organization&member=')), null);
	assert.equal(recordOf(at('?section=organization&member=%20')), null);
});

// requirement 21: the workspaces section is a directory of cards too, and it names its records by
// its own word, so a reader carrying a member from the section beside it names no workspace.
test('a workspace is named by its own word, and a member is not one', () => {
	assert.equal(recordOf(at('?section=workspaces&workspace=ws-1'), WORKSPACE_PARAM), 'ws-1');
	assert.equal(sectionOf(at('?section=workspaces&workspace=ws-1')), 'workspaces');
	assert.equal(recordOf(at('?section=workspaces&member=ada'), WORKSPACE_PARAM), null);
	assert.equal(recordOf(at('?section=workspaces&workspace='), WORKSPACE_PARAM), null);
});

// requirement 14, on the way in: the area is the one address that draws signed out, and general
// is the only section that needs no organization. What it holds there is the language, the
// ending-soon figure, updates and diagnostics.
test('with nobody signed in, only the section that needs no session is offered', () => {
	assert.deepEqual(sectionsFor(null, false), ['general']);
	assert.deepEqual(sectionsFor(null, true), ['general']);
});

test('anybody signed in is offered all four, in order', () => {
	const session = fakeOrganizationSession({
		role: 'owner',
		permissions: maskOf(
			'inviteMember',
			'removeMember',
			'assignRole',
			'renameWorkspace',
			'resetPassword',
			'renameMember',
			'grantWorkspace'
		)
	});

	assert.deepEqual(sectionsFor(session, true), [...SETTINGS_SECTIONS]);
});

// requirement 24: the gate moved from the section to the block inside it. A member who changes
// nobody's row still reads the sync status, the way out and their own account, so the section is
// theirs and the directory is not.
test('a member who administers nothing is offered all four, and no directory', () => {
	const session = fakeOrganizationSession({ role: 'member', permissions: 0 });

	assert.deepEqual(sectionsFor(session, true), [...SETTINGS_SECTIONS]);
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
