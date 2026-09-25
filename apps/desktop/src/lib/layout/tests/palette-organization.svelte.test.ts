import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { placeholderStrings as strings } from '$lib/design/tests/strings';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import {
	memberHost,
	organizationHostState,
	resetOrganizationHost,
	workspaceHost
} from '$lib/organization/host.svelte';
import type { MemberStanding, OrganizationMember, OrganizationSession } from '$lib/platform/host';
import {
	fakeOrganizationMember,
	fakeOrganizationSession,
	fakeOrganizationWorkspace,
	fakeSyncState,
	fakeWorkspace
} from '$lib/platform/tests/testing';
import { usesAppleKeyboard } from '@rentable/design/shortcut.js';
import { maskOf } from '@rentable/workspace-permission';

import PaletteHarness from './palette-harness.svelte';

/**
 * A MEMBER'S AND A WORKSPACE'S ACTS, IN THE COMMAND MENU
 *
 * Ticket 34 of [[efforts/832-the-interface-speaks-one-language-and-guides/spec]], requirements 7
 * and 8: the command menu offers a member's and a workspace's acts through its asking mode, as it
 * offers every other concept's, and gates them as the settings directories do. Choosing an act
 * asks for the record; choosing the record reaches the organization host with the member or the
 * workspace and the reader's facts beside it.
 *
 * **What the reader may not do is not offered.** Their gates are known before a record is named,
 * so an act no record admits for this reader is absent, and once an act is chosen only the records
 * it admits are listed. One waiting on a write already running is listed and refused with the
 * reason.
 *
 * **The reads are the mock**: the session, the members, where each stands and the machine's sync
 * record reach a shell this runner has none of. The host's `run` is spied on rather than stood in
 * for, so what is asserted is what the palette handed it.
 */

const answers = {
	session: null as OrganizationSession | null,
	members: [] as OrganizationMember[],
	standings: [] as MemberStanding[]
};

vi.mock('$lib/organization/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/organization/query')>()),
	useFetchOrganizationState: () => ({
		get data() {
			return answers.session ? { session: answers.session } : undefined;
		}
	}),
	useFetchMembers: () => ({
		get data() {
			return answers.members;
		}
	}),
	useFetchMemberStandings: () => ({
		get data() {
			return answers.standings;
		}
	})
}));

vi.mock('$lib/settings/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/settings/query')>()),
	useFetchRemoteSyncState: () => ({
		data: fakeSyncState({ workspace: fakeWorkspace({ remoteId: 'north' }) })
	})
}));

const member = (overrides: Partial<OrganizationMember>): OrganizationMember =>
	fakeOrganizationMember(overrides);

const olivia = member({ id: 'owner', username: 'olivia', role: 'owner' });
const ada = member({ id: 'ada', username: 'ada', role: 'manager' });
const sami = member({ id: 'sami', username: 'sami' });

beforeEach(() => {
	loadLocale('en');
	setLocale('en');

	window.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;

	// the command list brings its first row into view as it opens, which jsdom cannot do.
	Element.prototype.scrollIntoView = () => {};

	answers.members = [olivia, ada, sami];
	answers.standings = [olivia, ada, sami].map((one) => ({
		memberId: one.id,
		passwordSet: true,
		machineSignedIn: false
	}));
	resetOrganizationHost();
});

afterEach(() => {
	vi.restoreAllMocks();
	resetOrganizationHost();
});

/** ada, an administrator whose row carries the reset and nothing else. */
const readAsAda = () => {
	answers.session = fakeOrganizationSession({
		memberId: 'ada',
		username: 'ada',
		role: 'manager',
		permissions: maskOf('resetPassword')
	});
};

/** the menu, opened with Mod+K. */
const openPalette = async () => {
	render(PaletteHarness, { strings, direction: 'ltr' });

	await fireEvent.keyDown(
		document.body,
		usesAppleKeyboard() ? { key: 'k', metaKey: true } : { key: 'k', ctrlKey: true }
	);

	await waitFor(() => expect(document.querySelector('[role=dialog]')).not.toBeNull());
};

/** the row an act or a record is offered on, by the value the menu keys it on. */
const row = (value: string) =>
	document.querySelector<HTMLElement>(`[data-slot=command-item][data-value="${value}"]`);

test('a member act reaches the organization host with the member the reader chose', async () => {
	readAsAda();
	const run = vi.spyOn(memberHost, 'run');

	await openPalette();

	await waitFor(() => expect(row('member.unsetPassword')).not.toBeNull());
	await fireEvent.click(row('member.unsetPassword')!);

	// asked for a member: only the ones the act admits for ada, which is nobody's card but sami's.
	await waitFor(() => expect(row('sami')).not.toBeNull());
	expect(row('owner')).toBeNull();
	expect(row('ada')).toBeNull();

	await fireEvent.click(row('sami')!);

	expect(run).toHaveBeenCalledTimes(1);
	const [actId, record] = run.mock.calls[0];
	expect(actId).toBe('member.unsetPassword');
	expect(record.member).toEqual(sami);
	expect(record.context).toMatchObject({ selfId: 'ada', isOwner: false, canReset: true });
	expect(organizationHostState.member.pressed).toEqual({
		kind: 'unsetPassword',
		memberId: 'sami'
	});
});

test('a member act the reader may not take is not offered', async () => {
	readAsAda();

	await openPalette();

	await waitFor(() => expect(row('member.makeLink')).not.toBeNull());
	expect(row('member.endSessions')).not.toBeNull();

	// ada's row carries neither removeMember, renameMember, changeRole nor grantWorkspace, and the
	// handover is the owner's alone.
	for (const act of [
		'member.edit',
		'member.remove',
		'member.lockOut',
		'member.offerOwnership',
		'member.withdrawOffer'
	]) {
		expect(row(act), act).toBeNull();
	}
});

test('a member waiting on a write already running is listed and refused with the reason', async () => {
	readAsAda();
	organizationHostState.member.pending.unsetting = 'someone';
	const run = vi.spyOn(memberHost, 'run');

	await openPalette();

	await waitFor(() => expect(row('member.unsetPassword')).not.toBeNull());
	await fireEvent.click(row('member.unsetPassword')!);

	await waitFor(() => expect(row('sami')).not.toBeNull());
	expect(row('sami')!.getAttribute('aria-disabled')).toBe('true');
	expect(row('sami')!.textContent).toContain('working');

	await fireEvent.click(row('sami')!);

	expect(run).not.toHaveBeenCalled();
});

test('a workspace act reaches the organization host with the workspace the reader chose', async () => {
	const north = fakeOrganizationWorkspace({ id: 'north', name: 'North Properties' });

	answers.session = fakeOrganizationSession({
		memberId: 'owner',
		role: 'owner',
		permissions: maskOf('grantWorkspace'),
		workspaces: [north]
	});
	const run = vi.spyOn(workspaceHost, 'run');

	await openPalette();

	await waitFor(() => expect(row('workspace.members')).not.toBeNull());
	await fireEvent.click(row('workspace.members')!);

	await waitFor(() => expect(row('north')).not.toBeNull());
	await fireEvent.click(row('north')!);

	expect(run).toHaveBeenCalledTimes(1);
	const [actId, record] = run.mock.calls[0];
	expect(actId).toBe('workspace.members');
	expect(record.workspace).toEqual(north);
	expect(record.context).toEqual({
		openWorkspaceId: 'north',
		canRename: false,
		canGrantWorkspace: true,
		canDelete: true
	});
	expect(organizationHostState.workspace.changingAccess?.workspace).toEqual(north);
});

test('a workspace act the reader may not take is not offered', async () => {
	// a member whose row carries nothing an act is gated on.
	answers.session = fakeOrganizationSession({
		memberId: 'sami',
		role: 'member',
		permissions: 0
	});

	await openPalette();

	// the menu has drawn: its destinations are there whatever the reader holds.
	await waitFor(() =>
		expect(document.querySelectorAll('[data-slot=command-item]').length).toBeGreaterThan(0)
	);

	for (const act of ['workspace.edit', 'workspace.members', 'workspace.delete']) {
		expect(row(act), act).toBeNull();
	}

	// nor anything of a member's, since sami's row writes nobody.
	expect(document.querySelector('[data-value^="member."]')).toBeNull();
});
