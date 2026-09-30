import assert from 'node:assert/strict';
import test from 'node:test';

import {
	SECTION_HOLDING,
	SETTINGS_SECTIONS,
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
 * that is gone, and which sections a reader is offered. `app/tests/settings-area.svelte.test.ts`
 * reads the same gating on screen, and `organization/role/tests/role.test.ts` the gate on the members
 * directory, which is the organization section's own.
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
	assert.deepEqual(sectionsFor(false, []), ['general']);
	assert.deepEqual(sectionsFor(false, ['account', 'organization', 'workspaces']), ['general']);
});

test('anybody signed in is offered all four, in order', () => {
	assert.deepEqual(sectionsFor(true, ['account', 'organization', 'workspaces']), [
		...SETTINGS_SECTIONS
	]);
});

// general is the area's own, so it leads whatever is contributed, and a contribution under a name
// that is not one of the four has no address to be opened at.
test('general leads, and a contribution with no address is not offered', () => {
	assert.deepEqual(sectionsFor(true, ['general', 'account', 'nowhere']), ['general', 'account']);
});
