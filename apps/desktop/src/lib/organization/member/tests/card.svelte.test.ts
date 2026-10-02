import { render } from '@testing-library/svelte';
import { afterEach, beforeEach, expect, test } from 'vitest';

import { placeholderStrings as strings } from '$lib/design/tests/strings';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import en from '$lib/i18n/en';
import ar from '$lib/i18n/ar';
import type { MemberStanding, OrganizationMember } from '$lib/organization/host';
import MemberCard, { MEMBER_TILE_HEIGHT } from '$lib/organization/member/component/card.svelte';
import { fakeOrganizationMember } from '$lib/organization/tests/testing';
import { formatLocaleDate } from '$lib/platform/locale';
import Providers from '#tests/providers.svelte';

/**
 * A MEMBER'S TILE
 *
 * Ticket 32 of [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], requirement 1
 * as revised on 2026-10-02 and requirements 18 and 19: a member's tile carries the avatar, the
 * username and the role badge, then every fact the member read answers, each with its glyph and
 * its word, and no count of zero. The directory that lays the tiles is
 * `directory.svelte.test.ts`'s.
 */

/** what the tile says of a member, in English, by the key it is said with. */
const card = en.organization.dashboard.memberCard;

const JOINED = Date.UTC(2026, 2, 14, 12);

const ADA = fakeOrganizationMember({
	id: 'ada',
	username: 'ada',
	role: 'manager',
	createdAt: JOINED,
	workspaces: [
		{ id: 'ws-1', access: 'full-access', pinned: 0, granted: 0, permissions: 0 },
		{ id: 'ws-2', access: 'read-only', pinned: 0, granted: 0, permissions: 0 }
	]
});

const standing = (overrides: Partial<MemberStanding> = {}): MemberStanding => ({
	memberId: 'ada',
	passwordSet: true,
	machineSignedIn: true,
	...overrides
});

beforeEach(() => {
	loadLocale('en');
	loadLocale('ar');
	setLocale('en');
});

afterEach(() => {
	document.body.innerHTML = '';
});

const draw = (
	member: OrganizationMember = ADA,
	answered: MemberStanding | null = standing(),
	direction: 'ltr' | 'rtl' = 'ltr'
) =>
	render(
		MemberCard,
		{ member, standing: answered, role: 'manager', href: '/settings?member=ada', actions: [] },
		{ wrapper: Providers, wrapperProps: { strings, direction } }
	);

/** each fact the tile draws, as its words. */
const facts = () =>
	[...document.querySelectorAll<HTMLElement>('[data-fact]')].map((fact) =>
		fact.textContent?.replace(/\s+/g, ' ').trim()
	);

const joinedOn = (locale: 'en' | 'ar') => formatLocaleDate(locale, JOINED, { dateStyle: 'medium' });

test('a member tile carries the avatar, the username and the role badge in its heading', () => {
	draw();

	const tile = document.querySelector('[data-layout=tile]')!;

	expect(tile.querySelector('[data-slot="avatar-fallback"]')?.textContent?.trim()).toBe('AD');
	expect(tile.querySelector('[data-member-username]')?.textContent?.trim()).toBe('ada');
	expect(tile.querySelector('[data-slot=badge]')?.textContent?.trim()).toBe('manager');
	// the card's link is named by the username, and nothing else names the member.
	expect(tile.querySelector('a')?.getAttribute('aria-label')).toBe('ada');
});

test('every fact is drawn with its glyph and its word', () => {
	draw(
		fakeOrganizationMember({ ...ADA, override: 4, offeredOwnership: true }),
		standing({ passwordSet: true, machineSignedIn: true })
	);

	expect(facts()).toEqual([
		card.passwordSet,
		card.signedIn,
		'2 workspaces',
		`joined ${joinedOn('en')}`,
		card.ownPermissions,
		card.offered
	]);

	const glyphs = [...document.querySelectorAll('[data-fact]')].map((fact) => {
		const svg = fact.querySelector('svg');

		expect(svg?.getAttribute('aria-hidden')).toBe('true');

		// the glyph's own class, past the one every lucide icon carries.
		return [...(svg?.classList ?? [])]
			.find((name) => name.startsWith('lucide-') && name !== 'lucide-icon')
			?.slice('lucide-'.length);
	});

	expect(glyphs).toEqual(['key-round', 'laptop', 'building', 'calendar', 'user-cog', 'crown']);
});

test('where the account stands is said either way', () => {
	draw(ADA, standing({ passwordSet: false, machineSignedIn: false }));

	expect(facts().slice(0, 2)).toEqual([card.noPassword, card.noMachine]);
});

// the standings are a second read: until it answers, the tile says nothing of the password or the
// machine rather than something untrue.
test('before the standing is answered, the tile draws neither the password nor the machine', () => {
	draw(ADA, null);

	expect(facts()).toEqual(['2 workspaces', `joined ${joinedOn('en')}`]);
});

test('a count is worded for its figure, and a count of zero is not drawn', () => {
	draw(fakeOrganizationMember({ ...ADA, workspaces: [ADA.workspaces[0]] }));

	expect(facts()).toContain('1 workspace');

	document.body.innerHTML = '';
	draw(fakeOrganizationMember({ ...ADA, workspaces: [] }));

	expect(facts()).toContain(card.noWorkspaces);
	expect(document.body.textContent).not.toMatch(/(^|\s)0\s/);
});

test('the marks at the foot are drawn only where they mark the member out', () => {
	draw();

	expect(document.querySelector('[data-member-marks]')).toBeNull();
	expect(facts()).not.toContain(card.ownPermissions);
	expect(facts()).not.toContain(card.offered);
});

// the arabic plural has six forms, and a form left out reads as nothing for the counts that
// select it; two is the one english has no form for.
test('in arabic, every fact reads in its own words and every count with its word', () => {
	setLocale('ar');

	const words = ar.organization.dashboard.memberCard;
	const ids = (count: number) =>
		Array.from({ length: count }, (_, index) => ({
			id: `ws-${index}`,
			access: 'full-access' as const,
			pinned: 0,
			granted: 0,
			permissions: 0
		}));

	draw(ADA, standing({ passwordSet: false, machineSignedIn: false }), 'rtl');

	expect(facts().slice(0, 2)).toEqual([words.noPassword, words.noMachine]);
	expect(facts()[3]).toBe(`انضم في ${joinedOn('ar')}`);

	for (const [count, word] of [
		[1, 'مساحة عمل'],
		[2, 'مساحتا عمل'],
		[3, 'مساحات عمل'],
		[11, 'مساحة عمل'],
		[100, 'مساحة عمل']
	] as const) {
		document.body.innerHTML = '';
		draw(fakeOrganizationMember({ ...ADA, workspaces: ids(count) }), null, 'rtl');

		expect(facts()[0]).toMatch(new RegExp(`^\\S+ ${word}$`));
	}

	setLocale('en');
});

// the list lays the tiles at a declared height rather than measuring them, so the figure is the
// count of the tile's lines at the facts' fixed leading: the padding, the heading, four facts and
// the foot.
test('the declared height is the count of its lines at the fixed leading', () => {
	expect(MEMBER_TILE_HEIGHT).toBe(32 + 32 + 4 + 5 * (4 + 20));

	draw(fakeOrganizationMember({ ...ADA, override: 4 }));

	for (const line of document.querySelectorAll('[data-fact], [data-member-marks]')) {
		expect(line.getAttribute('class')).toContain('leading-5');
	}
});
