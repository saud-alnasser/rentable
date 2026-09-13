import { render, screen } from '@testing-library/svelte';
import { expect, test } from 'vitest';

import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import Members from '$lib/organization/component/members.svelte';
import type { OrganizationMember } from '$lib/platform/host';
import en from '$lib/i18n/en';
import ar from '$lib/i18n/ar';

/**
 * THE MEMBERS, RENDERED
 *
 * Which controls each row carries, for whom. What is worth pinning is requirement 14's shape on
 * the screen: the ordinary removal is the control and the lock-out is a lesser, separate one
 * drawn for the owner alone; neither is drawn on the owner's row or the reader's own; and the
 * two say what they are in both locales.
 *
 * And requirement 24's avatar: every row draws the first two characters of its username,
 * upper-cased, in the same disc the rail's account control draws.
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

const list = (overrides: Partial<Parameters<typeof render<typeof Members>>[1]> = {}) =>
	render(Members, {
		members,
		workspaces: [],
		canInvite: true,
		canRemove: true,
		canLockOut: true,
		selfId: 'owner',
		reissuing: null,
		onReissue: noop,
		onRemove: noop,
		onLockOut: noop,
		...overrides
	});

const removeControls = () => document.querySelectorAll('[data-member-remove]').length;
const lockOutControls = () => document.querySelectorAll('[data-member-lock-out]').length;

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
	list({ canInvite: false, canRemove: false, canLockOut: false, selfId: 'sami' });

	expect(removeControls()).toBe(0);
	expect(lockOutControls()).toBe(0);
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
	list();

	expect(screen.getAllByRole('button', { name: ar.organization.dashboard.remove })).toHaveLength(2);
	expect(
		screen.getAllByRole('button', { name: ar.organization.dashboard.removeAndLockOut })
	).toHaveLength(2);
	expect(ar.organization.dashboard.remove).not.toBe(ar.organization.dashboard.removeAndLockOut);
});
