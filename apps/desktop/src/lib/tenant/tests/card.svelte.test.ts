import { render } from '@testing-library/svelte';
import { afterEach, beforeEach, expect, test } from 'vitest';

import Providers from '#tests/providers.svelte';
import { layOutLists } from '#tests/permission.ts';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import ar from '$lib/i18n/ar';
import en from '$lib/i18n/en';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import TenantCard from '$lib/tenant/component/card.svelte';

/**
 * A TENANT'S CARD
 *
 * Requirement 19 of [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], for
 * tenants: the name, then the national id and the phone each with its glyph, then a chip for each
 * status the tenant's contracts stand in, its word drawn, and nothing for a status holding none;
 * *no contracts* where every count is zero. What the card holds is the one the human approved on
 * the development workspace (effort 846, the cards on real data).
 */

const ORDER = ['defaulted', 'active', 'scheduled', 'fulfilled', 'expired', 'terminated'] as const;

const NONE = {
	contractsScheduled: 0,
	contractsActive: 0,
	contractsFulfilled: 0,
	contractsDefaulted: 0,
	contractsExpired: 0,
	contractsTerminated: 0
};

const TENANT = { id: 'tenant-1', name: 'Sara', nationalId: '1000000000', phone: '+966500000000' };

beforeEach(() => {
	loadLocale('en');
	setLocale('en');
	layOutLists();
});

afterEach(() => {
	document.body.innerHTML = '';
});

const card = (counts: Partial<typeof NONE> | undefined, direction: 'ltr' | 'rtl' = 'ltr') =>
	render(
		TenantCard,
		{
			tenant: { ...TENANT, ...(counts && { ...NONE, ...counts }) },
			actions: [],
			statuses: ORDER
		},
		{ wrapper: Providers, wrapperProps: { strings, direction } }
	);

const facts = () => [...document.querySelectorAll<HTMLElement>('[data-fact]')];
const chips = () => [...document.querySelectorAll<HTMLElement>('[data-status-count]')];

test('the card is a tile, named by the tenant', () => {
	card({ contractsActive: 1 });

	const tile = document.querySelector('[data-layout=tile]');

	expect(tile?.textContent).toContain('Sara');
	expect(tile?.querySelector('a')?.getAttribute('aria-label')).toBe('Sara');
});

test('every fact carries its glyph, at the fixed leading the tile height counts on', () => {
	card({ contractsActive: 1 });

	expect(facts().length).toBe(2);
	for (const fact of facts()) {
		expect(fact.querySelector('svg')).not.toBe(null);
		expect(fact.classList).toContain('leading-5');
	}
	// a number reads left to right in both locales.
	expect(facts()[0].querySelector('[dir=ltr]')?.textContent).toBe('1000000000');
	expect(facts()[1].querySelector('[dir=ltr]')?.textContent).toBe('+966500000000');
	expect(document.querySelector('[data-tenant-contracts]')?.classList).toContain('leading-5');
});

test('a chip for each status holding contracts, in the order given, its word drawn', () => {
	card({ contractsActive: 2, contractsDefaulted: 1, contractsFulfilled: 3 });

	expect(chips().map((chip) => chip.dataset.statusCount)).toEqual([
		'defaulted',
		'active',
		'fulfilled'
	]);
	expect(chips().map((chip) => chip.textContent?.trim())).toEqual([
		'1 defaulted',
		'2 active',
		'3 fulfilled'
	]);
	for (const chip of chips()) {
		expect(chip.querySelector('svg')).not.toBe(null);
		// the word is drawn, not kept for a screen reader alone.
		expect(chip.querySelector('.sr-only')).toBe(null);
	}
	expect(chips()[0].classList).toContain('text-destructive');
	expect(document.body.textContent).not.toContain(en.tenants.card.noContracts);
});

test('a status holding no contract draws no chip', () => {
	card({ contractsTerminated: 1 });

	expect(chips().map((chip) => chip.dataset.statusCount)).toEqual(['terminated']);
	expect(document.body.textContent).not.toMatch(/\b0\b/);
});

test('with every count at zero, the card says there are no contracts, with its glyph', () => {
	card({});

	expect(chips()).toEqual([]);

	const none = document.querySelector('[data-tenant-contracts]');

	expect(none?.textContent).toBe(en.tenants.card.noContracts);
	expect(none?.closest('[data-fact]')?.querySelector('svg')).not.toBe(null);
});

test('for a reader who may not view contracts, the card says nothing of them', () => {
	card(undefined);

	expect(chips()).toEqual([]);
	expect(document.querySelector('[data-tenant-contracts]')).toBe(null);
	expect(document.body.textContent).not.toContain(en.tenants.card.noContracts);
});

test('in arabic, a chip draws its word in arabic', () => {
	loadLocale('ar');
	setLocale('ar');
	card({ contractsActive: 2 }, 'rtl');

	expect(chips().map((chip) => chip.textContent?.trim())).toEqual([
		ar.tenants.card.contracts.active.replace('{count|number}', '2')
	]);
});
