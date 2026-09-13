import { DesignProvider } from '@rentable/design/strings.js';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import Members from '$lib/organization/component/members.svelte';
import type { OrganizationMember } from '$lib/platform/host';
import en from '$lib/i18n/en';
import ar from '$lib/i18n/ar';
import { placeholderStrings as strings } from '$lib/design/tests/strings';

/**
 * THE MEMBERS, RENDERED
 *
 * Which controls each row carries, for whom. What is worth pinning is requirement 14's shape on
 * the screen: the ordinary removal is the control and the lock-out is a lesser, separate one
 * drawn for the owner alone; neither is drawn on the owner's row or the reader's own; and the
 * two say what they are in both locales.
 *
 * And requirement 21 of the redesign: a row names its member by the one username and nothing
 * else, no address and no display name. And requirement 24's avatar: every row draws the first
 * two characters of its username, upper-cased, in the same disc the rail's account control
 * draws.
 *
 * And requirement 23 of the redesign: a rename is the row's own control, on every row but the
 * reader's own, and it opens one light form surface with one username field. The refusal it
 * draws is the sentence Rust's `validate_username` carries, read off the source here so the two
 * cannot drift; the invite form and the walk's name step read the same sentence through the
 * shared schema in `organization/username-form.ts`.
 *
 * No submit is fired: a superforms SPA submit reaches SvelteKit's `applyAction`, which this
 * runner does not carry. The refusal is reached the way a person first meets it, by leaving the
 * field, which is client-side validation and needs no submit.
 */

const noop = () => {};
const member = (overrides: Partial<OrganizationMember>): OrganizationMember => ({
	id: 'm',
	username: 'member',
	role: 'member',
	permissions: 0,
	mustChangePassword: false,
	workspaceIds: [],
	createdAt: 0,
	...overrides
});
const members = [
	member({ id: 'owner', username: 'olivia', role: 'owner' }),
	member({ id: 'ada', username: 'ada', role: 'administrator' }),
	member({ id: 'sami', username: 'sami' })
];

const inProvider = (direction: 'ltr' | 'rtl') => ({
	wrapper: DesignProvider,
	wrapperProps: { strings, direction }
});

const list = (
	overrides: Partial<Parameters<typeof render<typeof Members>>[1]> = {},
	direction: 'ltr' | 'rtl' = 'ltr'
) =>
	render(
		Members,
		{
			members,
			workspaces: [],
			canInvite: true,
			canRemove: true,
			canLockOut: true,
			canRename: true,
			selfId: 'owner',
			reissuing: null,
			onReissue: noop,
			onRemove: noop,
			onLockOut: noop,
			onRename: async () => {},
			...overrides
		},
		inProvider(direction)
	);

const removeControls = () => document.querySelectorAll('[data-member-remove]').length;
const lockOutControls = () => document.querySelectorAll('[data-member-lock-out]').length;
const renameControls = () => document.querySelectorAll('[data-member-rename]').length;
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

test('the owner sees a removal and a lock-out on every row but their own', () => {
	loadLocale('en');
	setLocale('en');
	list();

	expect(removeControls()).toBe(2);
	expect(lockOutControls()).toBe(2);
	expect(document.querySelector('[data-member-remove="owner"]')).toBeNull();
	expect(screen.getAllByRole('button', { name: en.organization.dashboard.remove })).toHaveLength(2);
	expect(
		screen.getAllByRole('button', { name: en.organization.dashboard.removeAndLockOut })
	).toHaveLength(2);
});

// the lock-out needs the turso authority, which is the owner's machine's; an administrator gets
// the ordinary removal and nothing that would be refused.
test('an administrator sees the ordinary removal and no lock-out, and not on their own row', () => {
	loadLocale('en');
	setLocale('en');
	list({ canLockOut: false, selfId: 'ada' });

	expect(removeControls()).toBe(1);
	expect(lockOutControls()).toBe(0);
	expect(document.querySelector('[data-member-remove="sami"]')).not.toBeNull();
	expect(document.querySelector('[data-member-remove="ada"]')).toBeNull();
	expect(document.querySelector('[data-member-remove="owner"]')).toBeNull();
});

test('a member without the act sees no removal at all', () => {
	loadLocale('en');
	setLocale('en');
	list({ canInvite: false, canRemove: false, canLockOut: false, canRename: false, selfId: 'sami' });

	expect(removeControls()).toBe(0);
	expect(lockOutControls()).toBe(0);
	expect(renameControls()).toBe(0);
});

// criterion 21: the row names its member by the username, and by nothing else.
test('each row names its member by the username and carries no address or display name, in both locales', () => {
	for (const locale of ['en', 'ar'] as const) {
		loadLocale(locale);
		setLocale(locale);

		const rendered = list({}, locale === 'ar' ? 'rtl' : 'ltr');
		const named = Array.from(document.querySelectorAll('[data-member-username]')).map((node) =>
			node.textContent?.trim()
		);

		expect(named, locale).toEqual(['olivia', 'ada', 'sami']);

		for (const row of Array.from(document.querySelectorAll('[data-member]'))) {
			// one name on the row, and no line under it that would hold a second one.
			expect(row.querySelectorAll('[data-member-username]'), locale).toHaveLength(1);
			expect(row.textContent, locale).not.toContain('@');
		}

		rendered.unmount();
	}

	setLocale('en');
});

// criterion 24: each row's avatar carries its member's initials, read off the username.
test('each row draws the first two characters of its username, upper-cased, in the avatar', () => {
	loadLocale('en');
	setLocale('en');
	list();

	const avatarOf = (id: string) =>
		document
			.querySelector(`[data-member="${id}"] [data-slot="avatar-fallback"]`)
			?.textContent?.trim();

	expect(avatarOf('owner')).toBe('OL');
	expect(avatarOf('ada')).toBe('AD');
	expect(avatarOf('sami')).toBe('SA');
	expect(document.querySelectorAll('[data-slot="avatar-fallback"]')).toHaveLength(3);
});

test('and in arabic the two controls are named apart', () => {
	loadLocale('ar');
	setLocale('ar');
	list({}, 'rtl');

	expect(screen.getAllByRole('button', { name: ar.organization.dashboard.remove })).toHaveLength(2);
	expect(
		screen.getAllByRole('button', { name: ar.organization.dashboard.removeAndLockOut })
	).toHaveLength(2);
	expect(ar.organization.dashboard.remove).not.toBe(ar.organization.dashboard.removeAndLockOut);

	setLocale('en');
});

// requirement 23: the rename is on every row but the reader's own, the owner's included when an
// administrator reads the list, since an account's name is an administrator's to change and
// never its holder's.
test("a rename is drawn on every row but the reader's own, for whoever carries the act", () => {
	loadLocale('en');
	setLocale('en');

	const owner = list();

	expect(renameControls()).toBe(2);
	expect(document.querySelector('[data-member-rename="owner"]')).toBeNull();
	expect(screen.getAllByRole('button', { name: en.organization.dashboard.rename })).toHaveLength(2);
	// nothing is open until a row asks.
	expect(surface()).toBeNull();
	owner.unmount();

	list({ canLockOut: false, selfId: 'ada' });

	expect(renameControls()).toBe(2);
	expect(document.querySelector('[data-member-rename="owner"]')).not.toBeNull();
	expect(document.querySelector('[data-member-rename="sami"]')).not.toBeNull();
	expect(document.querySelector('[data-member-rename="ada"]')).toBeNull();
});

test('the rename opens a light form surface with one username field, opened on the name the row holds', async () => {
	loadLocale('en');
	setLocale('en');
	list();

	await fireEvent.click(document.querySelector('[data-member-rename="sami"]')!);

	expect(surface()).not.toBeNull();
	// light: the centred panel, which the surface draws as a translated box rather than an edge
	// sheet.
	expect(surface()?.className).toContain('-translate-x-1/2');
	expect(screen.getByText(en.organization.dashboard.renameDescription)).toBeDefined();
	expect(
		Array.from(surface()!.querySelectorAll('input')).map((input) => input.getAttribute('name'))
	).toEqual(['username']);
	expect(usernameInput()?.value).toBe('sami');
	expect(screen.getByText(en.organization.dashboard.username)).toBeDefined();
});

// requirement 15 of the redesign: the field leads with its subject's glyph, muted. requirement
// 14: the rename carries its verb's glyph, on the row and on the surface's own control.
test('the field leads with a muted glyph, and the rename carries its verb', async () => {
	loadLocale('en');
	setLocale('en');
	list();

	const opener = document.querySelector('[data-member-rename="sami"]')!;

	expect(opener.querySelector('svg')).not.toBeNull();
	await fireEvent.click(opener);

	const input = usernameInput();
	const group = input?.closest('[data-slot=input-group]');
	const addon = group?.querySelector('[data-slot=input-group-addon]');

	expect(addon).not.toBeNull();
	expect(addon?.querySelector('svg')).not.toBeNull();
	expect(addon?.className).toContain('text-muted-foreground');
	expect(addon!.compareDocumentPosition(input!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

	const rename = Array.from(surface()!.querySelectorAll('button')).find(
		(button) => button.getAttribute('type') === 'submit'
	);

	expect(rename?.textContent?.trim()).toBe(en.organization.dashboard.rename);
	expect(rename?.querySelector('svg')).not.toBeNull();
});

// criterion 23: a username outside requirement 21's rules is refused on the field with the one
// sentence, and the sentence is Rust's own, so the dialog, the command and the invite form's
// shared rule cannot refuse the same name in two voices.
test('a username outside the rules is refused with the sentence rust refuses it with', async () => {
	loadLocale('en');
	setLocale('en');
	list();

	await fireEvent.click(document.querySelector('[data-member-rename="sami"]')!);

	const input = usernameInput()!;

	await fireEvent.input(input, { target: { value: 'sa' } });
	await fireEvent.focusOut(input);

	await waitFor(() => {
		expect(screen.getByRole('alert').textContent).toBe(en.organization.dashboard.usernameRules);
	});
	expect(input.getAttribute('aria-invalid')).toBe('true');
	expect(en.organization.dashboard.usernameRules).toBe(rustUsernameRules());

	await fireEvent.input(input, { target: { value: 'sami staff' } });
	await fireEvent.focusOut(input);

	await waitFor(() => {
		expect(screen.getByRole('alert').textContent).toBe(en.organization.dashboard.usernameRules);
	});
});

test('cancelling closes the surface without a rename', async () => {
	loadLocale('en');
	setLocale('en');

	const renamed: string[] = [];
	list({
		onRename: async (memberId, username) => {
			renamed.push(`${memberId}:${username}`);
		}
	});

	await fireEvent.click(document.querySelector('[data-member-rename="sami"]')!);
	expect(surface()).not.toBeNull();

	await fireEvent.click(screen.getByRole('button', { name: en.common.actions.cancel }));

	await waitFor(() => {
		expect(surface()).toBeNull();
	});
	expect(renamed).toEqual([]);
});

test('and in arabic, the rename is named in its own words on a surface read right to left', async () => {
	loadLocale('ar');
	setLocale('ar');
	list({}, 'rtl');

	expect(screen.getAllByRole('button', { name: ar.organization.dashboard.rename })).toHaveLength(2);
	expect(ar.organization.dashboard.rename).not.toBe(en.organization.dashboard.rename);
	expect(ar.organization.dashboard.usernameRules).not.toBe(en.organization.dashboard.usernameRules);

	await fireEvent.click(document.querySelector('[data-member-rename="sami"]')!);

	expect(surface()?.getAttribute('dir')).toBe('rtl');
	expect(screen.getByText(ar.organization.dashboard.renameDescription)).toBeDefined();

	const input = usernameInput()!;

	await fireEvent.input(input, { target: { value: 'سامي' } });
	await fireEvent.focusOut(input);

	await waitFor(() => {
		expect(screen.getByRole('alert').textContent).toBe(ar.organization.dashboard.usernameRules);
	});

	setLocale('en');
});
