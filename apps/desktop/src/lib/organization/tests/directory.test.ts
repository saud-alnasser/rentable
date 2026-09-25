import assert from 'node:assert/strict';
import test from 'node:test';

import { toMemberDirectory, toWorkspaceDirectory } from '../directory.ts';
import { fakeOrganizationMember, fakeOrganizationWorkspace } from '../../platform/tests/testing.ts';
import type { OrganizationMember } from '../../platform/host.ts';

/**
 * THE SETTINGS DIRECTORIES, SEARCHED AND ORDERED
 *
 * Requirement 7 of [[efforts/832-the-interface-speaks-one-language-and-guides/spec]]: the members
 * and workspaces directories search the way every set does, and a term typed in Arabic-Indic
 * digits still finds what its Western spelling finds.
 */

const member = (overrides: Partial<OrganizationMember>): OrganizationMember =>
	fakeOrganizationMember(overrides);

const members = [
	member({ id: 'sami', username: 'sami' }),
	member({ id: 'owner', username: 'olivia', role: 'owner' }),
	member({ id: 'ada', username: 'ada2026', role: 'manager' })
];

// what a member's role is called, as the directory's caller names it.
const roleLabel = (member: { role: string }) => member.role;

const ids = (records: readonly { id: string }[]) => records.map((record) => record.id);

test('an empty term keeps every member, in the order they arrived', () => {
	assert.deepEqual(ids(toMemberDirectory(members, '', null, roleLabel)), ['sami', 'owner', 'ada']);
});

test('a member is found by their username or by what their role is called', () => {
	assert.deepEqual(ids(toMemberDirectory(members, 'OLI', null, roleLabel)), ['owner']);
	assert.deepEqual(ids(toMemberDirectory(members, 'manag', null, roleLabel)), ['ada']);
});

test('a term typed in Arabic-Indic digits finds a username written in Western ones', () => {
	assert.deepEqual(ids(toMemberDirectory(members, '٢٠٢٦', null, roleLabel)), ['ada']);
});

test('members order by username both ways, and by role with the most authority first', () => {
	assert.deepEqual(
		ids(toMemberDirectory(members, '', { columnId: 'username', direction: 'asc' }, roleLabel)),
		['ada', 'owner', 'sami']
	);
	assert.deepEqual(
		ids(toMemberDirectory(members, '', { columnId: 'username', direction: 'desc' }, roleLabel)),
		['sami', 'owner', 'ada']
	);
	assert.deepEqual(
		ids(toMemberDirectory(members, '', { columnId: 'role', direction: 'asc' }, roleLabel)),
		['owner', 'ada', 'sami']
	);
});

const workspaces = [
	fakeOrganizationWorkspace({ id: 'south', name: 'Tower 7' }),
	fakeOrganizationWorkspace({ id: 'north', name: 'Tower 12' })
];

const held: Record<string, number> = { south: 3, north: 1 };

test('a workspace is found by its name, Arabic-Indic digits included', () => {
	assert.deepEqual(ids(toWorkspaceDirectory(workspaces, '١٢', null, (id) => held[id])), ['north']);
});

test('workspaces order by name, and by how many hold each', () => {
	assert.deepEqual(
		ids(
			toWorkspaceDirectory(workspaces, '', { columnId: 'name', direction: 'asc' }, (id) => held[id])
		),
		['north', 'south']
	);
	assert.deepEqual(
		ids(
			toWorkspaceDirectory(
				workspaces,
				'',
				{ columnId: 'members', direction: 'desc' },
				(id) => held[id]
			)
		),
		['south', 'north']
	);
});
