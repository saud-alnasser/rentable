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
 * **What a row offers** is drawn from the reader's permissions alone, and an act the session
 * lacks is absent from the menu rather than disabled in it. Copy link is narrower still: Rust
 * seals the link to its issuer, so the row offers it only where the payload says the reader
 * issued it.
 *
 * **Every act is read by opening the row's one control**, which is what requirement 6 of effort
 * 828 replaced the hover cluster with. A row whose menu is open is the only one in the document,
 * so the items in it are that row's, in the order the four groups put them; `actsOn` opens a row,
 * reads them, and closes it again, and a row that offers this reader nothing has no control to
 * open.
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
			makingLink: null,
			unsetting: null,
			revoking: null,
			endingSessions: null,
			isChangingRole: false,
			isChangingAccess: false,
			onEndSessions: noop,
			onMakeLink: noop,
			onUnsetPassword: noop,
			onRevoke: noop,
			onRemove: noop,
			onLockOut: noop,
			onRename: resolved,
			onChangeRole: resolved,
			onChangeAccess: resolved,
			...overrides
		},
		{ wrapper: Providers, wrapperProps: { strings, direction } }
	);

/** the acts a row can offer, in the order the four groups put them in the menu. */
const KINDS = [
	'rename',
	'role',
	'access',
	'link',
	'unset-password',
	'end-sessions',
	'revoke',
	'remove',
	'lock-out'
] as const;

const on = (kind: string, id: string) => document.querySelector(`[data-member-${kind}="${id}"]`);
const row = (id: string) => document.querySelector(`[data-member="${id}"]`);

/** the one control a row carries, or nothing where this reader may do nothing to that row. */
const control = (id: string) => row(id)?.querySelector<HTMLButtonElement>('button') ?? null;

/** open a row's control, read what its menu offers, and close it again. */
const actsOn = async (id: string) => {
	const trigger = control(id);

	if (!trigger) return [];

	await fireEvent.click(trigger);

	const offered = Array.from(document.querySelectorAll('[data-slot=dropdown-menu-item]')).map(
		(item) => KINDS.find((kind) => item.hasAttribute(`data-member-${kind}`)) ?? item.textContent
	);

	await fireEvent.click(trigger);

	return offered;
};

/** open a row's control and hand back one act's entry, the way a person reaches it. */
const openTo = async (id: string, kind: string) => {
	await fireEvent.click(control(id)!);

	return document.querySelector<HTMLElement>(`[data-member-${kind}="${id}"]`);
};

/** open a row's control and press one act. */
const press = async (id: string, kind: string) => {
	await fireEvent.click((await openTo(id, kind))!);
};
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

// requirement 6 of effort 828: one sentence under the legend says who is listed and who keeps
// the list, and the invite leads the section instead of trailing everybody already in it.
test('the section says who is listed, and the invite leads it rather than trailing the list', () => {
	list();

	expect(document.querySelector('[data-members-description]')?.textContent?.trim()).toBe(
		en.organization.dashboard.membersDescription
	);
	// the legend is the section's own now, drawn beside the sentence rather than by the area.
	expect(document.querySelector('legend')?.textContent?.trim()).toBe(en.settings.section.members);

	const opener = document.querySelector('[data-invite-open]')!;
	const first = document.querySelector('[data-member]')!;

	expect(opener.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

// requirement 6: the acts read in four groups, what somebody is called, what they may do, their
// way in, and leaving, and the separators between them are the whole of that grouping.
test('the acts open in four groups, with the two that destroy something marked', async () => {
	list();

	await fireEvent.click(control('sami')!);

	expect(document.querySelectorAll('[data-slot=dropdown-menu-separator]')).toHaveLength(3);
	expect(on('remove', 'sami')?.getAttribute('data-variant')).toBe('destructive');
	expect(on('lock-out', 'sami')?.getAttribute('data-variant')).toBe('destructive');
	expect(on('rename', 'sami')?.getAttribute('data-variant')).toBe('default');
});

// criterion 15: each row action sits behind its act. The owner reading holds all seven, so every
// act is in the menu, and never on their own row or on the owner's.
test('the owner sees every row action, on every row but their own', async () => {
	list();

	expect(await actsOn('ada')).toEqual([
		'rename',
		'role',
		'access',
		'link',
		'unset-password',
		'end-sessions',
		'remove',
		'lock-out'
	]);
	// the pending row alone offers the act on an invitation.
	expect(await actsOn('sami')).toEqual([
		'rename',
		'role',
		'access',
		'link',
		'unset-password',
		'end-sessions',
		'revoke',
		'remove',
		'lock-out'
	]);
	// the reader's own row is the owner's here: nothing writes it, and the rename is an
	// administrator's to make and never its holder's, so there is no control at all.
	expect(control('owner')).toBeNull();
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

	for (const id of ['owner', 'ada', 'sami']) {
		expect(control(id), id).toBeNull();
	}
	expect(document.querySelector('[data-invite-open]')).toBeNull();
});

// each act on its own, so no entry is being carried by a neighbour's gate.
test('each action is drawn by its own act and by no other', async () => {
	const only = async (
		overrides: Partial<Parameters<typeof render<typeof Members>>[1]>,
		id: string,
		offered: string[]
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

		expect(await actsOn(id), offered.join()).toEqual(offered);
		rendered.unmount();
	};

	await only({ canChangeRole: true }, 'ada', ['role']);
	await only({ canGrantWorkspace: true }, 'ada', ['access']);
	await only({ canRename: true }, 'ada', ['rename']);
	// unsetting a password and closing the ways in that are already open are one act read twice.
	await only({ canReset: true }, 'ada', ['unset-password', 'end-sessions']);
	await only({ canRemove: true }, 'ada', ['remove']);
	// the lock-out needs the Turso authority as well as the act, so it takes both.
	await only({ canRemove: true, canLockOut: true }, 'ada', ['remove', 'lock-out']);
	// the link is every account's, and the revoke is the pending row's alone.
	await only({ canInvite: true }, 'sami', ['link', 'revoke']);
	await only({ canInvite: true }, 'ada', ['link']);
});

// criterion 22 of effort 826: ending somebody's sessions is `resetPassword`'s, beside the reset
// and never on the owner's row or the reader's own. The press reaches the route, which is
// where the mutation is.
test('signing a member out of every machine is offered behind reset password, and never on the owner', async () => {
	const asked: string[] = [];

	list({ selfId: 'ada', isOwner: false, onEndSessions: (memberId) => asked.push(memberId) });

	// the owner's row and the reader's own carry no such act; sami's does.
	expect(await actsOn('owner')).not.toContain('end-sessions');
	expect(await actsOn('ada')).not.toContain('end-sessions');
	expect(await actsOn('sami')).toContain('end-sessions');

	const entry = await openTo('sami', 'end-sessions');

	expect(entry?.textContent?.trim()).toBe(en.organization.dashboard.endSessions);

	await fireEvent.click(entry!);

	expect(asked).toEqual(['sami']);
});

// effort 828, requirement 20: one act makes a link for an account, whatever the account's standing
// is, so there is one entry here where there were a copy link and a new link. Which kind of link
// it is, and whether a machine is already signed in on the account, are the shell's to decide and
// to refuse. *There was a fresh-code control beside a copy until a code began living as long as
// the link it came with, and a copy beside a new link until one act replaced both.*
test('one link act is drawn for every account, and the reader chooses nothing but the account', async () => {
	list();

	expect(await actsOn('ada')).toContain('link');
	expect(await actsOn('sami')).toContain('link');

	const entry = await openTo('sami', 'link');

	expect(entry?.textContent?.trim()).toBe(en.organization.dashboard.makeLink);
	expect(document.querySelector('[data-member-copy-link]')).toBeNull();
	expect(document.querySelector('[data-member-code]')).toBeNull();
});

test('the row hands its account to the link and the reset, and its invitation to the revoke', async () => {
	const linked: string[] = [];
	const revoked: string[] = [];
	const unset: string[] = [];

	list({
		onMakeLink: (memberId) => linked.push(memberId),
		onRevoke: (invitationId) => revoked.push(invitationId),
		onUnsetPassword: (memberId) => unset.push(memberId)
	});

	await press('sami', 'link');
	await press('sami', 'revoke');
	await press('sami', 'unset-password');

	expect(linked).toEqual(['sami']);
	expect(revoked).toEqual(['invitation-1']);
	expect(unset).toEqual(['sami']);
});

// [[rules/interface]], *Row activation* and *Record card actions*: an act is reached from a
// control the reader can see, and never from the row itself.
test('the acts are behind one visible control, and the row itself opens nothing', () => {
	list();

	const ada = row('ada')!;

	expect(ada.tagName).toBe('DIV');
	expect(ada.getAttribute('role')).toBeNull();
	expect(ada.closest('a')).toBeNull();
	// one control on the row, named for a screen reader as well as for a pointer.
	expect(ada.querySelectorAll('button')).toHaveLength(1);
	expect(control('ada')?.getAttribute('aria-label')).toBe(
		en.organization.dashboard.memberActions.replace('{username:string}', 'ada')
	);
	// and nothing left that a reader has to hover to find.
	expect(document.querySelector('[data-member-actions]')).toBeNull();
	expect(ada.innerHTML).not.toContain('opacity-0');
});

// criterion 15: the add control opens the surface the shell holds.
test('the add control asks the shell for the account form', async () => {
	list();

	const opener = screen.getByRole('button', { name: en.organization.dashboard.addAccount });

	// requirement 14 of effort 824: the verb's glyph before its label.
	expect(opener.querySelector('svg')).not.toBeNull();
	expect(organizationDialog.open).toBeNull();
	await fireEvent.click(opener);
	expect(organizationDialog.open).toBe('account');
	// no account surface of its own: the one instance is mounted in the shell.
	expect(surface()).toBeNull();
});

test('the role act opens the role dialog on the row it named', async () => {
	list();

	await press('ada', 'role');

	expect(surface()).not.toBeNull();
	expect(
		screen.getByText(
			en.organization.dashboard.changeRoleDescription.replace('{username:string}', 'ada')
		)
	).toBeDefined();
	expect(document.querySelector('[data-role-form]')).not.toBeNull();
});

test('the access act opens the access dialog on the workspaces the member holds', async () => {
	list();

	await press('ada', 'access');

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

	await press('ada', 'rename');

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

	await press('ada', 'rename');

	const input = usernameInput()!;

	await fireEvent.input(input, { target: { value: 'ad' } });
	await fireEvent.focusOut(input);

	await waitFor(() => {
		expect(screen.getByRole('alert').textContent).toBe(en.organization.dashboard.usernameRules);
	});
	expect(input.getAttribute('aria-invalid')).toBe('true');
	expect(en.organization.dashboard.usernameRules).toBe(rustUsernameRules());
});

test('and in arabic every row reads in its own words, right to left', async () => {
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
	expect(document.querySelector('[data-members-description]')?.textContent?.trim()).toBe(
		ar.organization.dashboard.membersDescription
	);
	expect(ar.organization.dashboard.membersDescription).not.toBe(
		en.organization.dashboard.membersDescription
	);
	expect(screen.getByRole('button', { name: ar.organization.dashboard.addAccount })).toBeDefined();
	// the row's control is named in Arabic too, and so is every act the menu holds.
	expect(control('ada')?.getAttribute('aria-label')).toBe(
		ar.organization.dashboard.memberActions.replace('{username}', 'ada')
	);

	const lockOut = await openTo('ada', 'lock-out');

	expect(lockOut?.textContent?.trim()).toBe(ar.organization.dashboard.removeAndLockOut);
	expect(on('remove', 'ada')?.textContent?.trim()).toBe(ar.organization.dashboard.remove);
	expect(ar.organization.dashboard.remove).not.toBe(ar.organization.dashboard.removeAndLockOut);

	setLocale('en');
});
