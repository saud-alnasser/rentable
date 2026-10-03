import { render } from '@testing-library/svelte';
import { afterEach, beforeEach, expect, test } from 'vitest';

import Providers from '#tests/providers.svelte';
import { layOutLists } from '#tests/permission.ts';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import ar from '$lib/i18n/ar';
import en from '$lib/i18n/en';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import TenantCard, { TENANT_TILE_HEIGHT } from '$lib/tenant/component/card.svelte';

/**
 * A TENANT'S CARD
 *
 * Ticket 42 of [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], requirement 1
 * as revised on 2026-10-03 and requirements 18 and 19, for tenants: the name in the heading, then
 * its facts as tinted fields in the member card's family, two across: the national id and the
 * phone, each held left to right, then the contracts across the second row, a chip for each status
 * holding any with its word drawn, or *no contracts* drawn muted where every count is zero. No
 * count of zero is drawn as a figure, in either locale.
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
	loadLocale('ar');
	setLocale('en');
	layOutLists();
});

afterEach(() => {
	document.body.innerHTML = '';
});

const card = (counts: Partial<typeof NONE> | undefined, locale: 'en' | 'ar' = 'en') => {
	setLocale(locale);

	return render(
		TenantCard,
		{
			tenant: { ...TENANT, ...(counts && { ...NONE, ...counts }) },
			actions: [],
			statuses: ORDER
		},
		{
			wrapper: Providers,
			wrapperProps: { strings, direction: locale === 'ar' ? ('rtl' as const) : ('ltr' as const) }
		}
	);
};

/** the glyph a lucide icon draws, by its own class past the one every lucide icon carries. */
const glyphOf = (svg: Element | null) =>
	[...(svg?.classList ?? [])]
		.find((name) => name.startsWith('lucide-') && name !== 'lucide-icon')
		?.slice('lucide-'.length);

const fieldElements = () => [...document.querySelectorAll<HTMLElement>('[data-tenant-field]')];

/** each field the tile draws, as its glyph, its name and its value. */
const fields = () =>
	fieldElements().map((field) => {
		const svg = field.querySelector('[data-tenant-field-name] svg');

		expect(svg?.getAttribute('aria-hidden')).toBe('true');

		return {
			glyph: glyphOf(svg),
			name: field.querySelector('[data-tenant-field-name]')?.textContent?.trim(),
			value: field.querySelector('[data-tenant-field-value]')?.textContent?.trim()
		};
	});

const chips = () => [...document.querySelectorAll<HTMLElement>('[data-status-count]')];

/** whether a zero stands on the card as a figure of its own, in western or arabic digits. */
const drawsAZero = () => /(^|[^\d٠-٩])[0٠]($|[^\d٠-٩])/.test(document.body.textContent ?? '');

/** a count's words, as the locale says them with the figure in place. */
const said = (template: string, count: number) => template.replace('{count|number}', `${count}`);

test('the card is a tile, named by the tenant in its heading', () => {
	card({ contractsActive: 1 });

	const tile = document.querySelector('[data-layout=tile]');

	expect(tile?.textContent).toContain('Sara');
	expect(tile?.querySelector('a')?.getAttribute('aria-label')).toBe('Sara');
	// the name is the heading, not a field.
	expect(fields().map((field) => field.value)).not.toContain('Sara');
});

for (const locale of ['en', 'ar'] as const) {
	const words = locale === 'en' ? en : ar;

	test(`in ${locale}, the facts are tinted fields two across, each with its glyph, name and value`, () => {
		card({ contractsActive: 2, contractsDefaulted: 1 }, locale);

		const grid = document.querySelector<HTMLElement>('[data-tenant-fields]')!;

		expect(grid.classList).toContain('grid');
		expect(grid.classList).toContain('grid-cols-2');
		expect(grid.querySelectorAll(':scope > [data-tenant-field]')).toHaveLength(3);

		const defaulted = said(words.tenants.card.contracts.defaulted, 1);
		const active = said(words.tenants.card.contracts.active, 2);

		expect(fields()).toEqual([
			{ glyph: 'id-card', name: words.common.labels.nationalId, value: '1000000000' },
			{ glyph: 'phone', name: words.common.labels.phone, value: '+966500000000' },
			{
				glyph: 'file-text',
				name: words.tenants.card.contractsName,
				value: expect.stringContaining(defaulted)
			}
		]);
		expect(chips().map((chip) => chip.textContent?.trim())).toEqual([defaulted, active]);

		for (const field of fieldElements()) {
			// softly tinted with the muted token, no border, and both lines at the fixed leading
			// the declared height counts on.
			expect(field.classList).toContain('bg-muted');
			expect(field.classList).not.toContain('border');
			expect(field.querySelector('[data-tenant-field-name]')?.getAttribute('class')).toContain(
				'leading-5'
			);
			expect(field.querySelector('[data-tenant-field-value]')?.getAttribute('class')).toContain(
				'leading-5'
			);
		}

		// a number reads left to right in both locales.
		const [nationalId, phone, contracts] = fieldElements();

		expect(nationalId.querySelector('[dir=ltr]')?.textContent).toBe('1000000000');
		expect(phone.querySelector('[dir=ltr]')?.textContent).toBe('+966500000000');

		// the contracts take the second row whole.
		expect(contracts.classList).toContain('col-span-2');
		expect(drawsAZero()).toBe(false);
	});

	test(`in ${locale}, with every count at zero, the contracts field says there are none, muted`, () => {
		card({}, locale);

		expect(chips()).toEqual([]);
		expect(fields()[2]).toEqual({
			glyph: 'file-text',
			name: words.tenants.card.contractsName,
			value: words.tenants.card.noContracts
		});

		const value = fieldElements()[2].querySelector('[data-tenant-field-value]')!;

		expect(value.hasAttribute('data-empty')).toBe(true);
		expect(value.getAttribute('class')).toContain('text-muted-foreground');
		expect(drawsAZero()).toBe(false);
	});
}

test('a chip for each status holding contracts, in the order given, in its tone, its word drawn', () => {
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
	expect(drawsAZero()).toBe(false);
});

test('for a reader who may not view contracts, the card says nothing of them', () => {
	card(undefined);

	expect(chips()).toEqual([]);
	expect(fields().map((field) => field.glyph)).toEqual(['id-card', 'phone']);
	expect(document.querySelector('[data-tenant-contracts]')).toBe(null);
	expect(document.body.textContent).not.toContain(en.tenants.card.noContracts);
});

test('the declared height counts the heading and two rows of fields', () => {
	// the padding, the heading line, 12 to the fields, two fields of 56 with 8 between.
	expect(TENANT_TILE_HEIGHT).toBe(32 + 32 + 12 + 56 + 8 + 56);
});
