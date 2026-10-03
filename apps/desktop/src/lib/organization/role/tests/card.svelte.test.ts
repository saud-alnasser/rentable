import { render } from '@testing-library/svelte';
import { afterEach, beforeEach, expect, test } from 'vitest';

import { placeholderStrings as strings } from '$lib/design/tests/strings';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import en from '$lib/i18n/en';
import ar from '$lib/i18n/ar';
import type { OrganizationRole } from '$lib/organization/host';
import RoleCard, { ROLE_TILE_HEIGHT } from '$lib/organization/role/component/card.svelte';
import { fakeOrganizationRole } from '$lib/organization/tests/testing';
import { BUILT_IN, maskOf } from '@rentable/workspace-permission';
import Providers from '#tests/providers.svelte';

/**
 * A ROLE'S TILE
 *
 * Ticket 39 of [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], requirement 1
 * as revised on 2026-10-02 and requirement 19: a role's tile matches the member's, a glyph tile,
 * the name and a badge of how many hold it, then four tinted fields each with its glyph, its name
 * and its value, and no count of zero drawn as a figure. The directory that lays the tiles is
 * `directory.svelte.test.ts`'s.
 */

const card = en.organization.roleCard;

const CLERK = fakeOrganizationRole({
	id: 'clerk',
	name: 'clerk',
	mask: maskOf('viewTenant', 'createTenant', 'viewPayment', 'inviteMember'),
	holders: 2
});

const NOBODY = fakeOrganizationRole({ id: 'empty', name: 'empty', mask: 0, holders: 0 });

beforeEach(() => {
	loadLocale('en');
	loadLocale('ar');
	setLocale('en');
});

afterEach(() => {
	document.body.innerHTML = '';
});

const draw = (role: OrganizationRole = CLERK, direction: 'ltr' | 'rtl' = 'ltr') =>
	render(
		RoleCard,
		{ role, name: role.name || 'owner', href: `/settings?role=${role.id}`, actions: [] },
		{ wrapper: Providers, wrapperProps: { strings, direction } }
	);

/** each field the tile draws: what it counts, whether it has its glyph, its name and its value. */
const fields = () =>
	[...document.querySelectorAll<HTMLElement>('[data-role-field]')].map((field) => ({
		kind: field.dataset.roleField,
		glyph: field.querySelector('[data-role-field-name] svg') !== null,
		name: field.querySelector('[data-role-field-name]')?.textContent?.trim(),
		value: field.querySelector('[data-role-field-value]')?.textContent?.trim()
	}));

/** no figure of zero anywhere on the tile, in western or Arabic digits. */
const expectNoZero = () => {
	const tile = document.querySelector<HTMLElement>('[data-layout=tile]')!;

	expect(tile.textContent).not.toMatch(/(^|[^\d٠-٩])[0٠]([^\d٠-٩]|$)/);
};

test('a role tile carries the shield glyph, the name and a holders badge in its heading', () => {
	draw();

	const tile = document.querySelector('[data-layout=tile]')!;

	expect(tile.querySelector('[data-role-glyph] svg')).not.toBeNull();
	expect(tile.querySelector('[data-role-name]')?.textContent?.trim()).toBe('clerk');

	const badge = tile.querySelector('[data-role-holders]')!;

	expect(badge.getAttribute('data-slot')).toBe('badge');
	expect(badge.textContent?.trim()).toBe('2 members');
});

test('four fields in a two-column grid, each with a glyph, a name and a value', () => {
	draw();

	const grid = document.querySelector('[data-role-fields]')!;

	expect(grid.classList).toContain('grid');
	expect(grid.classList).toContain('grid-cols-2');
	expect(fields()).toEqual([
		{ kind: 'reads', glyph: true, name: card.fields.reads, value: '2 of 5 kinds' },
		{ kind: 'changes', glyph: true, name: card.fields.changes, value: '1 of 5 kinds' },
		{ kind: 'people', glyph: true, name: card.fields.people, value: '1 of 7 acts' },
		{ kind: 'organization', glyph: true, name: card.fields.organization, value: card.noActs }
	]);
	// a field holding nothing is drawn muted, so the fields holding something lead.
	expect(
		document
			.querySelector('[data-role-field=organization] [data-role-field-value]')
			?.getAttribute('data-held')
	).toBe('none');
	expect(
		document
			.querySelector('[data-role-field=reads] [data-role-field-value]')
			?.getAttribute('data-held')
	).toBe('some');
});

test('a role holding everything says so in words', () => {
	draw(fakeOrganizationRole({ ...BUILT_IN.owner, kind: 'owner', name: '', holders: 1 }));

	expect(fields().map((field) => field.value)).toEqual([
		card.everyRecord,
		card.everyRecord,
		card.everyAct,
		card.everyAct
	]);
	expect(document.querySelector('[data-role-holders]')?.textContent?.trim()).toBe('1 member');
});

test('nothing held and nobody holding it are said in words, never as a zero', () => {
	draw(NOBODY);

	expect(document.querySelector('[data-role-holders]')?.textContent?.trim()).toBe(card.noHolders);
	expect(fields().map((field) => field.value)).toEqual([
		card.noKinds,
		card.noKinds,
		card.noActs,
		card.noActs
	]);
	expectNoZero();
});

test('in Arabic, the tile keeps its glyphs and says every field in Arabic', () => {
	setLocale('ar');
	draw(CLERK, 'rtl');

	const said = ar.organization.roleCard;

	expect(document.querySelector('[data-role-glyph] svg')).not.toBeNull();
	expect(fields().map(({ kind, glyph, name }) => ({ kind, glyph, name }))).toEqual([
		{ kind: 'reads', glyph: true, name: said.fields.reads },
		{ kind: 'changes', glyph: true, name: said.fields.changes },
		{ kind: 'people', glyph: true, name: said.fields.people },
		{ kind: 'organization', glyph: true, name: said.fields.organization }
	]);
	for (const field of fields()) {
		expect(field.value).toMatch(/[؀-ۿ]/);
		expect(field.value).not.toMatch(/[a-z]/i);
	}
	expect(document.querySelector('[data-role-holders]')?.textContent).toMatch(/[؀-ۿ]/);

	document.body.innerHTML = '';
	draw(NOBODY, 'rtl');

	expect(document.querySelector('[data-role-holders]')?.textContent?.trim()).toBe(said.noHolders);
	expect(fields().map((field) => field.value)).toEqual([
		said.noKinds,
		said.noKinds,
		said.noActs,
		said.noActs
	]);
	expectNoZero();
});

test('every line below the heading sets its own leading, so the declared height holds', () => {
	draw();

	expect(ROLE_TILE_HEIGHT).toBe(196);
	for (const line of document.querySelectorAll('[data-role-field-name], [data-role-field-value]')) {
		expect(line.classList).toContain('leading-5');
	}
	for (const field of document.querySelectorAll('[data-role-field]')) {
		expect(field.classList).toContain('py-2');
	}
});
