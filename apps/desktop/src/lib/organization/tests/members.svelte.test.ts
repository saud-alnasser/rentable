import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { beforeEach, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { formatRecordDate } from '$lib/design/date';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import Members from '$lib/organization/component/members.svelte';
import { organizationDialog, resetOrganizationDialogs } from '$lib/organization/dialogs.svelte';
import type { OrganizationMember, OrganizationWorkspace } from '$lib/platform/host';
import en from '$lib/i18n/en';
import ar from '$lib/i18n/ar';
import { placeholderStrings as strings } from '$lib/design/tests/strings';

import Providers from './providers.svelte';

/**
 * THE MEMBERS, RENDERED
 *
 * Criterion 15 of [[efforts/826-the-organization-and-the-way-in-are-rethought/spec]]: one list,
 * active and pending alike, with the fields requirement 15 names on each row, every row action
 * behind its own act, and the invite button opening the shell's dialog.
 *
 * **What a row carries** is what the human settled on screen: the identity on the first line
 * (the avatar's two letters, the username, the role, and on a pending row the badge with its
 * expiry) and the workspaces as chips carrying their own access on the second.
 *
 * **What a row offers** is drawn from the reader's permissions alone, and a control for an act
 * the session lacks is absent rather than disabled. Copy link is narrower still: Rust seals the
 * link to its issuer, so the row offers it only where the payload says the reader issued it.
 *
 * Requirement 21 of effort 824 holds throughout: a row names its member by the one username and
 * carries no address and no display name. Requirement 24's avatar is the same two letters the
 * rail draws.
 *
 * The rename's own refusal is still read here, against the sentence Rust carries, because the
 * dialog this list owns is where a person meets it. No submit is fired for that one: a
 * superforms SPA submit reaches SvelteKit's `applyAction`, which this runner does not carry, so
 * the refusal is reached the way a person first meets it, by leaving the field.
 */

const noop = () => {};
const resolved = async () => {};

const workspaces: OrganizationWorkspace[] = [
	{
		id: 'ws-1',
		name: 'Riyadh',
		databaseName: 'ws-1',
		databaseHostname: 'ws-1.turso.io',
		schemaVersion: 1,
		accessLevel: 'full-access'
	},
	{
		id: 'ws-2',
		name: 'Jeddah',
		databaseName: 'ws-2',
		databaseHostname: 'ws-2.turso.io',
		schemaVersion: 1,
		accessLevel: 'full-access'
	}
];

const EXPIRES_AT = Date.UTC(2026, 8, 20);

const member = (overrides: Partial<OrganizationMember>): OrganizationMember => ({
	id: 'm',
	username: 'member',
	role: 'member',
	permissions: 0,
	workspaces: [],
	pending: null,
	createdAt: 0,
	...overrides
});

const members = [
	member({ id: 'owner', username: 'olivia', role: 'owner' }),
	member({
		id: 'ada',
		username: 'ada',
		role: 'administrator',
		workspaces: [
			{ id: 'ws-1', access: 'full-access' },
			{ id: 'ws-2', access: 'read-only' }
		]
	}),
	member({
		id: 'sami',
		username: 'sami',
		workspaces: [{ id: 'ws-1', access: 'full-access' }],
		pending: {
			invitationId: 'invitation-1',
			expiresAt: EXPIRES_AT,
			standing: 'open',
			canCopy: true
		}
	})
];

const list = (
	overrides: Partial<Parameters<typeof render<typeof Members>>[1]> = {},
	direction: 'ltr' | 'rtl' = 'ltr'
) =>
	render(
		Members,
		{
			members,
			workspaces,
			canInvite: true,
			canRemove: true,
			canLockOut: true,
			canRename: true,
			canReset: true,
			canChangeRole: true,
			canGrantWorkspace: true,
			isOwner: true,
			selfId: 'owner',
			reissuing: null,
			revoking: null,
			copying: null,
			isChangingRole: false,
			isChangingAccess: false,
			onReissue: noop,
			onRevoke: noop,
			onCopyLink: noop,
			onRemove: noop,
			onLockOut: noop,
			onRename: resolved,
			onChangeRole: resolved,
			onChangeAccess: resolved,
			...overrides
		},
		{ wrapper: Providers, wrapperProps: { strings, direction } }
	);

/** every control of one kind on the list, by the attribute the row marks it with. */
const controls = (kind: string) => document.querySelectorAll(`[data-member-${kind}]`).length;
const on = (kind: string, id: string) => document.querySelector(`[data-member-${kind}="${id}"]`);
const row = (id: string) => document.querySelector(`[data-member="${id}"]`);
const surface = () => document.querySelector('[data-slot=form-surface]');
const usernameInput = () => document.querySelector<HTMLInputElement>('input[name=username]');

/** the one sentence Rust refuses a username outside the rules with, read off the source. */
const rustUsernameRules = () => {
	const source = readFileSync(
		// the runner's root is `apps/desktop`, and the crate sits beside `src` there.
		resolve(process.cwd(), 'tauri/src/organization/invite.rs'),
		'utf8'
	);
	const declared = /pub const USERNAME_RULES: &str = "([^"]+)";/.exec(source);

	if (!declared) throw new Error('invite.rs no longer declares USERNAME_RULES');

	return declared[1];
};

beforeEach(() => {
	resetOrganizationDialogs();
	loadLocale('en');
	setLocale('en');
});

// criterion 15: one list, and the person who has not signed in yet is a row in it.
test('one list holds every member, active and pending alike', () => {
	list();

	expect(document.querySelectorAll('[data-members]')).toHaveLength(1);
	expect(document.querySelectorAll('[data-member]')).toHaveLength(3);
	expect(
		Array.from(document.querySelectorAll('[data-member-username]')).map((node) =>
			node.textContent?.trim()
		)
	).toEqual(['olivia', 'ada', 'sami']);
	// no second list, and no heading for one.
	expect(document.querySelector('[data-pending-accounts]')).toBeNull();
});

// criterion 15, an active row: the avatar, the username, the role, and the workspaces as chips
// carrying their own access.
test('an active row carries the avatar, the username, the role and its workspaces with their access', () => {
	list();

	const ada = row('ada')!;

	expect(ada.querySelector('[data-slot="avatar-fallback"]')?.textContent?.trim()).toBe('AD');
	expect(ada.querySelector('[data-member-username]')?.textContent?.trim()).toBe('ada');
	expect(ada.textContent).toContain(en.layout.signIn.roleAdministrator);

	const chips = Array.from(ada.querySelectorAll('[data-member-workspace]')).map((chip) =>
		chip.textContent?.replace(/\s+/g, ' ').trim()
	);

	expect(chips).toEqual([
		`Riyadh ${en.organization.dashboard.accessFull}`,
		`Jeddah ${en.organization.dashboard.accessReadOnly}`
	]);
	// one name on the row, and nothing that would carry a second one.
	expect(ada.querySelectorAll('[data-member-username]')).toHaveLength(1);
	expect(ada.textContent).not.toContain('@');
	// a member who holds nothing says so rather than showing an empty line.
	expect(on('no-workspace', 'owner')?.textContent?.trim()).toBe(
		en.organization.dashboard.noWorkspaces
	);
});

// criterion 15, a pending row: the mark is the badge, and it carries the expiry.
test('a pending row is marked with a badge and its expiry, and a lapsed one says so', () => {
	const open = list();

	expect(document.querySelectorAll('[data-member-pending]')).toHaveLength(1);
	expect(on('pending', 'open')?.textContent?.trim()).toBe(en.organization.dashboard.notYetSignedIn);
	expect(document.querySelector('[data-member-expiry]')?.textContent?.trim()).toBe(
		en.organization.dashboard.invitationExpires.replace(
			'{date:string}',
			formatRecordDate('en', EXPIRES_AT)
		)
	);
	open.unmount();

	list({
		members: [
			member({
				id: 'sami',
				username: 'sami',
				pending: {
					invitationId: 'invitation-1',
					expiresAt: EXPIRES_AT,
					standing: 'lapsed',
					canCopy: true
				}
			})
		]
	});

	expect(on('pending', 'lapsed')?.textContent?.trim()).toBe(
		en.organization.dashboard.standingLapsed
	);
	expect(document.querySelector('[data-member-expiry]')?.textContent?.trim()).toBe(
		en.organization.dashboard.invitationLapsed.replace(
			'{date:string}',
			formatRecordDate('en', EXPIRES_AT)
		)
	);
});

// criterion 15: each row action sits behind its act. The owner reading holds all seven, so every
// control is drawn, and never on their own row or on the owner's.
test('the owner sees every row action, on every row but their own', () => {
	list();

	expect(controls('role')).toBe(2);
	expect(controls('access')).toBe(2);
	expect(controls('rename')).toBe(2);
	expect(controls('new-link')).toBe(2);
	expect(controls('remove')).toBe(2);
	expect(controls('lock-out')).toBe(2);
	// the pending row alone offers the two that act on an invitation.
	expect(controls('copy-link')).toBe(1);
	expect(controls('revoke')).toBe(1);
	expect(on('copy-link', 'sami')).not.toBeNull();
	expect(on('revoke', 'sami')).not.toBeNull();
	// nothing that writes a row is drawn on the reader's own, and nothing at all on the owner's
	// but the rename, which is an administrator's to make and never its holder's.
	expect(on('role', 'owner')).toBeNull();
	expect(on('remove', 'owner')).toBeNull();
	expect(on('rename', 'owner')).toBeNull();
	expect(on('rename', 'ada')).not.toBeNull();
});

test('a member holding no act sees no row action at all', () => {
	list({
		canInvite: false,
		canRemove: false,
		canLockOut: false,
		canRename: false,
		canReset: false,
		canChangeRole: false,
		canGrantWorkspace: false,
		isOwner: false,
		selfId: 'sami'
	});

	for (const kind of ['role', 'access', 'rename', 'new-link', 'copy-link', 'revoke', 'remove']) {
		expect(controls(kind), kind).toBe(0);
	}
	expect(document.querySelector('[data-invite-open]')).toBeNull();
});

// each act on its own, so no control is being carried by a neighbour's gate.
test('each action is drawn by its own act and by no other', () => {
	const only = (
		overrides: Partial<Parameters<typeof render<typeof Members>>[1]>,
		kind: string,
		count: number
	) => {
		const rendered = list({
			canInvite: false,
			canRemove: false,
			canLockOut: false,
			canRename: false,
			canReset: false,
			canChangeRole: false,
			canGrantWorkspace: false,
			isOwner: false,
			selfId: 'owner',
			...overrides
		});

		expect(controls(kind), kind).toBe(count);
		rendered.unmount();
	};

	only({ canChangeRole: true }, 'role', 2);
	only({ canGrantWorkspace: true }, 'access', 2);
	only({ canRename: true }, 'rename', 2);
	only({ canReset: true }, 'new-link', 2);
	only({ canRemove: true }, 'remove', 2);
	// the lock-out needs the Turso authority as well as the act, so it takes both.
	only({ canRemove: true }, 'lock-out', 0);
	only({ canRemove: true, canLockOut: true }, 'lock-out', 2);
	only({ canInvite: true }, 'copy-link', 1);
	only({ canInvite: true }, 'revoke', 1);
});

// criterion 15: the link is sealed to whoever issued it, so the row offers a copy to them and a
// new link to everybody else.
test('copy link is drawn for the issuer alone, and a new link for anybody with the act', () => {
	const issuer = list();

	expect(on('copy-link', 'sami')).not.toBeNull();
	expect(on('new-link', 'sami')).not.toBeNull();
	issuer.unmount();

	list({
		members: members.map((candidate) =>
			candidate.pending
				? { ...candidate, pending: { ...candidate.pending, canCopy: false } }
				: candidate
		)
	});

	expect(on('copy-link', 'sami')).toBeNull();
	expect(on('new-link', 'sami')).not.toBeNull();
});

test('the pending row hands its invitation to the two acts that take one', async () => {
	const copied: string[] = [];
	const revoked: string[] = [];
	const reissued: string[] = [];

	list({
		onCopyLink: (invitationId, username) => copied.push(`${invitationId}:${username}`),
		onRevoke: (invitationId) => revoked.push(invitationId),
		onReissue: (memberId) => reissued.push(memberId)
	});

	await fireEvent.click(on('copy-link', 'sami')!);
	await fireEvent.click(on('revoke', 'sami')!);
	await fireEvent.click(on('new-link', 'sami')!);

	expect(copied).toEqual(['invitation-1:sami']);
	expect(revoked).toEqual(['invitation-1']);
	expect(reissued).toEqual(['sami']);
});

// [[rules/interface]], *Row activation*: an action is a control on the row, never the row.
test('the actions are controls on the row, and the row itself opens nothing', () => {
	list();

	const ada = row('ada')!;

	expect(ada.tagName).toBe('DIV');
	expect(ada.getAttribute('role')).toBeNull();
	expect(ada.closest('a')).toBeNull();
	// every action is a button, and it is named for a screen reader as well as for a pointer.
	const cluster = document.querySelector('[data-member-actions="ada"]')!;

	for (const control of Array.from(cluster.querySelectorAll('button'))) {
		expect(control.getAttribute('aria-label')?.length).toBeGreaterThan(0);
	}
	// on hover and on focus: the cluster is faded rather than removed, so the row does not move
	// and the keyboard still reaches it.
	expect(cluster.className).toContain('opacity-0');
	expect(cluster.className).toContain('group-hover:opacity-100');
	expect(cluster.className).toContain('focus-within:opacity-100');
});

// criterion 15: the invite button opens the dialog the shell holds.
test('the invite button asks the shell for the invite dialog', async () => {
	list();

	const opener = screen.getByRole('button', { name: en.organization.dashboard.invite });

	// requirement 14 of effort 824: the verb's glyph before its label.
	expect(opener.querySelector('svg')).not.toBeNull();
	expect(organizationDialog.open).toBeNull();
	await fireEvent.click(opener);
	expect(organizationDialog.open).toBe('invite');
	// no invite surface of its own: the one instance is mounted in the shell.
	expect(surface()).toBeNull();
});

test('the role control opens the role dialog on the row it named', async () => {
	list();

	await fireEvent.click(on('role', 'ada')!);

	expect(surface()).not.toBeNull();
	expect(
		screen.getByText(
			en.organization.dashboard.changeRoleDescription.replace('{username:string}', 'ada')
		)
	).toBeDefined();
	expect(document.querySelector('[data-role-form]')).not.toBeNull();
});

test('the access control opens the access dialog on the workspaces the member holds', async () => {
	list();

	await fireEvent.click(on('access', 'ada')!);

	expect(document.querySelector('[data-access-form]')).not.toBeNull();
	expect(
		Array.from(document.querySelectorAll('[data-access-row]')).map((row) =>
			row.getAttribute('data-access-row')
		)
	).toEqual(['ws-1', 'ws-2']);
	expect(
		screen.getByText(
			en.organization.dashboard.accessDescription.replace('{username:string}', 'ada')
		)
	).toBeDefined();
});

test('the rename opens a light form surface with one username field, opened on the name the row holds', async () => {
	list();

	await fireEvent.click(on('rename', 'ada')!);

	expect(surface()).not.toBeNull();
	// light: the centred panel, which the surface draws as a translated box rather than an edge
	// sheet.
	expect(surface()?.className).toContain('-translate-x-1/2');
	expect(screen.getByText(en.organization.dashboard.renameDescription)).toBeDefined();
	expect(
		Array.from(surface()!.querySelectorAll('input')).map((input) => input.getAttribute('name'))
	).toEqual(['username']);
	expect(usernameInput()?.value).toBe('ada');
});

// criterion 23 of effort 824: a username outside the rules is refused on the field with the one
// sentence, and the sentence is Rust's own.
test('a username outside the rules is refused with the sentence rust refuses it with', async () => {
	list();

	await fireEvent.click(on('rename', 'ada')!);

	const input = usernameInput()!;

	await fireEvent.input(input, { target: { value: 'ad' } });
	await fireEvent.focusOut(input);

	await waitFor(() => {
		expect(screen.getByRole('alert').textContent).toBe(en.organization.dashboard.usernameRules);
	});
	expect(input.getAttribute('aria-invalid')).toBe('true');
	expect(en.organization.dashboard.usernameRules).toBe(rustUsernameRules());
});

test('and in arabic every row reads in its own words, right to left', () => {
	loadLocale('ar');
	setLocale('ar');
	list({}, 'rtl');

	expect(
		Array.from(document.querySelectorAll('[data-member-username]')).map((node) =>
			node.textContent?.trim()
		)
	).toEqual(['olivia', 'ada', 'sami']);
	expect(on('pending', 'open')?.textContent?.trim()).toBe(ar.organization.dashboard.notYetSignedIn);
	expect(ar.organization.dashboard.notYetSignedIn).not.toBe(
		en.organization.dashboard.notYetSignedIn
	);
	expect(document.querySelector('[data-member-expiry]')?.textContent?.trim()).toBe(
		ar.organization.dashboard.invitationExpires.replace(
			'{date}',
			formatRecordDate('ar', EXPIRES_AT)
		)
	);
	expect(screen.getByRole('button', { name: ar.organization.dashboard.invite })).toBeDefined();
	expect(
		screen.getAllByRole('button', { name: ar.organization.dashboard.removeAndLockOut })
	).toHaveLength(2);
	expect(ar.organization.dashboard.remove).not.toBe(ar.organization.dashboard.removeAndLockOut);

	setLocale('en');
});
