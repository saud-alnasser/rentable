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
 * Tickets 32 and 37 of [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]],
 * requirement 1 as revised on 2026-10-02 and requirements 18 and 19: a member's tile carries the
 * avatar, the username and the role badge, then its facts as four tinted fields two by two, each
 * with its glyph, its name and its value, and the marks that apply as badges at its foot; no count
 * of zero. The directory that lays the tiles is `directory.svelte.test.ts`'s.
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

/** the glyph a lucide icon draws, by its own class past the one every lucide icon carries. */
const glyphOf = (svg: Element | null) =>
	[...(svg?.classList ?? [])]
		.find((name) => name.startsWith('lucide-') && name !== 'lucide-icon')
		?.slice('lucide-'.length);

/** each field the tile draws, as its glyph, its name and its value. */
const fields = () =>
	[...document.querySelectorAll<HTMLElement>('[data-member-field]')].map((field) => {
		const svg = field.querySelector('svg');

		expect(svg?.getAttribute('aria-hidden')).toBe('true');

		return {
			glyph: glyphOf(svg),
			name: field.querySelector('[data-member-field-name]')?.textContent?.trim(),
			value: field.querySelector('[data-member-field-value]')?.textContent?.trim()
		};
	});

/** the badges at the tile's foot, as their words. */
const marks = () =>
	[...document.querySelectorAll<HTMLElement>('[data-member-marks] [data-slot=badge]')].map(
		(badge) => badge.textContent?.trim()
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

test('the facts are four tinted fields in two columns, each with its glyph, name and value', () => {
	draw(ADA, standing({ passwordSet: true, machineSignedIn: true }));

	const grid = document.querySelector<HTMLElement>('[data-member-fields]')!;

	expect(grid.classList).toContain('grid');
	expect(grid.classList).toContain('grid-cols-2');
	expect(grid.querySelectorAll(':scope > [data-member-field]')).toHaveLength(4);

	// the workspaces and the joining first, the standing under them, so the standing arriving
	// later moves nothing already drawn.
	expect(fields()).toEqual([
		{ glyph: 'building', name: en.settings.section.workspaces, value: '2' },
		{ glyph: 'calendar', name: card.joined, value: joinedOn('en') },
		{ glyph: 'key-round', name: card.password, value: card.passwordSet },
		{ glyph: 'laptop', name: card.machine, value: card.signedIn }
	]);

	for (const field of document.querySelectorAll('[data-member-field]')) {
		// softly tinted with the muted token, no border, and both lines at the fixed leading.
		expect(field.classList).toContain('bg-muted');
		expect(field.classList).not.toContain('border');
		expect(field.querySelector('[data-member-field-name]')?.getAttribute('class')).toContain(
			'leading-5'
		);
		expect(field.querySelector('[data-member-field-value]')?.getAttribute('class')).toContain(
			'leading-5'
		);
	}

	// no marks apply to this member, so the foot draws nothing.
	expect(document.querySelector('[data-member-marks]')).toBeNull();
});

test('where the account stands is said either way, and a value saying nothing is muted', () => {
	draw(ADA, standing({ passwordSet: false, machineSignedIn: false }));

	expect(fields().slice(2)).toEqual([
		{ glyph: 'key-round', name: card.password, value: card.noPassword },
		{ glyph: 'laptop', name: card.machine, value: card.noMachine }
	]);
	expect(document.querySelector('[data-member-password]')?.classList).toContain(
		'text-muted-foreground'
	);
	expect(document.querySelector('[data-member-workspaces]')?.classList).toContain(
		'text-foreground'
	);
});

// the standings are a second read: until it answers, the tile says nothing of the password or the
// machine rather than something untrue.
test('before the standing is answered, the tile draws neither the password nor the machine', () => {
	draw(ADA, null);

	expect(fields().map(({ glyph }) => glyph)).toEqual(['building', 'calendar']);
	expect(document.querySelector('[data-member-password]')).toBeNull();
	expect(document.querySelector('[data-member-machine]')).toBeNull();
});

test('a count is its figure, and a count of zero is said in words, never drawn', () => {
	draw(fakeOrganizationMember({ ...ADA, workspaces: [ADA.workspaces[0]] }));

	expect(fields()[0].value).toBe('1');

	document.body.innerHTML = '';
	draw(fakeOrganizationMember({ ...ADA, workspaces: [] }));

	expect(fields()[0].value).toBe(card.noWorkspaces);
	expect(document.querySelector('[data-member-workspaces]')?.classList).toContain(
		'text-muted-foreground'
	);
	expect(document.body.textContent).not.toMatch(/(^|\s)0(\s|$)/);
});

test('the marks at the foot are badges, drawn only where they mark the member out', () => {
	draw(fakeOrganizationMember({ ...ADA, override: 4, offeredOwnership: true }));

	expect(marks()).toEqual([card.ownPermissions, card.offered]);

	const glyphs = [...document.querySelectorAll('[data-member-marks] svg')].map((svg) => {
		expect(svg.getAttribute('aria-hidden')).toBe('true');

		return glyphOf(svg);
	});

	expect(glyphs).toEqual(['user-cog', 'crown']);

	document.body.innerHTML = '';
	draw(fakeOrganizationMember({ ...ADA, offeredOwnership: true }));

	expect(marks()).toEqual([card.offered]);

	document.body.innerHTML = '';
	draw();

	expect(document.querySelector('[data-member-marks]')).toBeNull();
});

test('in arabic, the four fields read in their own words, right to left', () => {
	setLocale('ar');

	const words = ar.organization.dashboard.memberCard;

	draw(
		fakeOrganizationMember({ ...ADA, override: 4, offeredOwnership: true }),
		standing({ passwordSet: false, machineSignedIn: false }),
		'rtl'
	);

	expect(document.querySelector('[data-member-fields]')?.classList).toContain('grid-cols-2');
	expect(fields()).toEqual([
		{ glyph: 'building', name: ar.settings.section.workspaces, value: '2' },
		{ glyph: 'calendar', name: words.joined, value: joinedOn('ar') },
		{ glyph: 'key-round', name: words.password, value: words.noPassword },
		{ glyph: 'laptop', name: words.machine, value: words.noMachine }
	]);
	expect(marks()).toEqual([words.ownPermissions, words.offered]);

	for (const key of [
		'joined',
		'password',
		'machine',
		'noPassword',
		'noMachine',
		'noWorkspaces'
	] as const) {
		expect(words[key], key).not.toBe(card[key]);
	}

	document.body.innerHTML = '';
	draw(fakeOrganizationMember({ ...ADA, workspaces: [] }), null, 'rtl');

	expect(fields()[0].value).toBe(words.noWorkspaces);

	setLocale('en');
});

// the list lays the tiles at a declared height rather than measuring them, so the figure is the
// count of the tile's lines at their fixed leading: the padding, the heading, the gap to the
// fields, two rows of fields (padding, a name and a value), the gap to the foot, and the foot.
test('the declared height is the count of its lines at the fixed leading', () => {
	const field = 8 + 20 + 20 + 8;

	expect(MEMBER_TILE_HEIGHT).toBe(32 + 32 + 12 + (field + 8 + field) + 12 + 20);

	draw(fakeOrganizationMember({ ...ADA, override: 4, offeredOwnership: true }));

	expect(document.querySelector('[data-layout=tile]')?.classList).toContain('gap-3');

	const marksLine = document.querySelector('[data-member-marks]')!;

	expect(marksLine.classList).toContain('h-5');

	for (const badge of marksLine.querySelectorAll('[data-slot=badge]')) {
		expect(badge.classList).toContain('h-5');
	}
});
