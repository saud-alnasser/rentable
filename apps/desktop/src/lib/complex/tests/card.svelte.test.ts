import { render } from '@testing-library/svelte';
import { afterEach, beforeEach, expect, test } from 'vitest';

import ComplexCard, { COMPLEX_TILE_HEIGHT } from '$lib/complex/component/card.svelte';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import ar from '$lib/i18n/ar';
import en from '$lib/i18n/en';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import Providers from '#tests/providers.svelte';

/**
 * A COMPLEX'S TILE
 *
 * Tickets 17 and 43 of [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]],
 * requirement 1 as revised on 2026-10-03 and requirements 18 and 19: a complex's tile carries its
 * name, then its location and its unit counts as tinted fields two across, each a `Cell.Field`
 * with its glyph, its name and its value; a count of zero is said in words and muted, never drawn
 * as a figure.
 */

const COMPLEX = { id: 'complex-1', name: 'Palm Court', location: 'Riyadh' };

type Words = typeof en;

beforeEach(() => {
	loadLocale('en');
	loadLocale('ar');
	setLocale('en');
});

afterEach(() => {
	document.body.innerHTML = '';
});

const card = (complex: object, direction: 'ltr' | 'rtl' = 'ltr') =>
	render(
		ComplexCard,
		// the record as `complex.getMany` answers it; the test passes only the fields the tile reads.
		{ complex: complex as never, href: '/complexes/complex-1', actions: [] },
		{ wrapper: Providers, wrapperProps: { strings, direction } }
	);

/** the glyph a lucide icon draws, by its own class past the one every lucide icon carries. */
const glyphOf = (svg: Element | null) =>
	[...(svg?.classList ?? [])]
		.find((name) => name.startsWith('lucide-') && name !== 'lucide-icon')
		?.slice('lucide-'.length);

/** each field the tile draws, as its glyph, its name and its value. */
const fields = () =>
	[...document.querySelectorAll<HTMLElement>('[data-complex-field]')].map((field) => {
		const svg = field.querySelector('svg');

		expect(svg?.getAttribute('aria-hidden')).toBe('true');
		expect(field.hasAttribute('data-field')).toBe(true);

		return {
			glyph: glyphOf(svg),
			name: field.querySelector('[data-complex-field-name]')?.textContent?.trim(),
			value: field.querySelector('[data-complex-field-value]')?.textContent?.trim()
		};
	});

/** the four fields a counted complex draws, in the given locale's words. */
const expected = (words: Words, units: string, occupied: string, vacant: string) => [
	{ glyph: 'map-pin', name: words.common.labels.location, value: 'Riyadh' },
	{ glyph: 'layout-grid', name: words.common.labels.units, value: units },
	{ glyph: 'circle-user-round', name: words.common.status.occupied, value: occupied },
	{ glyph: 'circle-dashed', name: words.common.status.vacant, value: vacant }
];

const NO_ZERO_FIGURE = /(^|[^\d٠-٩])[0٠]($|[^\d٠-٩])/;

test('a complex tile names the complex and lays its facts as four fields two across', () => {
	card({ ...COMPLEX, unitCount: 3, vacantUnitCount: 1 });

	const tile = document.querySelector('[data-layout=tile]')!;

	expect(tile.textContent).toContain('Palm Court');
	expect(tile.querySelector('a')?.getAttribute('aria-label')).toBe('Palm Court');

	const grid = document.querySelector<HTMLElement>('[data-complex-fields]')!;

	expect(grid.classList).toContain('grid');
	expect(grid.classList).toContain('grid-cols-2');
	expect(grid.querySelectorAll(':scope > [data-complex-field]')).toHaveLength(4);
	expect(fields()).toEqual(expected(en, '3', '2', '1'));

	for (const field of document.querySelectorAll('[data-complex-field]')) {
		// softly tinted with the muted token, no border, and both lines at the fixed leading.
		expect(field.classList).toContain('bg-muted');
		expect(field.classList).not.toContain('border');
		expect(field.querySelector('[data-field-name]')?.getAttribute('class')).toContain('leading-5');
		expect(field.querySelector('[data-field-value]')?.getAttribute('class')).toContain('leading-5');
	}
});

test('occupied wears its status tone, and vacant reads in the value colour', () => {
	card({ ...COMPLEX, unitCount: 3, vacantUnitCount: 1 });

	expect(document.querySelector('[data-complex-occupied]')?.classList).toContain('text-primary');
	expect(document.querySelector('[data-complex-vacant]')?.classList).toContain('text-foreground');
	expect(document.querySelector('[data-complex-units]')?.classList).toContain('text-foreground');
});

test('a count of zero is said in words and muted, never drawn as a figure', () => {
	card({ ...COMPLEX, unitCount: 2, vacantUnitCount: 0 });

	expect(fields()).toEqual(expected(en, '2', '2', en.complexes.card.none));
	expect(document.querySelector('[data-complex-vacant]')?.classList).toContain(
		'text-muted-foreground'
	);

	document.body.innerHTML = '';
	card({ ...COMPLEX, unitCount: 0, vacantUnitCount: 0 });

	const none = en.complexes.card.none;

	expect(fields()).toEqual(expected(en, none, none, none));

	for (const hook of ['units', 'occupied', 'vacant']) {
		expect(document.querySelector(`[data-complex-${hook}]`)?.classList).toContain(
			'text-muted-foreground'
		);
	}

	expect(document.body.textContent).not.toMatch(NO_ZERO_FIGURE);
});

// effort 838, requirement 10: a reader who may not view units is answered with no counts, and the
// tile reads as a complex with nothing counted rather than as an empty one.
test('without the unit counts, the tile draws the location alone', () => {
	card(COMPLEX);

	expect(fields()).toEqual(expected(en, '', '', '').slice(0, 1));
	expect(document.querySelector('[data-complex-units]')).toBeNull();
	expect(document.body.textContent).not.toMatch(NO_ZERO_FIGURE);
});

test('in arabic, the fields carry their names and a zero is said in words', () => {
	setLocale('ar');
	card({ ...COMPLEX, unitCount: 3, vacantUnitCount: 0 }, 'rtl');

	const figure = (count: number) => new Intl.NumberFormat('ar').format(count);
	const said = fields();

	expect(said).toEqual(expected(ar as Words, figure(3), figure(3), ar.complexes.card.none));
	expect(ar.complexes.card.none).not.toBe(en.complexes.card.none);
	expect(document.body.textContent).not.toMatch(NO_ZERO_FIGURE);

	setLocale('en');
});

// the list lays the tiles at a declared height rather than measuring them, so the figure is the
// count of the tile's lines at their fixed leading: the padding, the heading, the gap to the
// fields, and two rows of fields (padding, a name and a value).
test('the declared height is the count of its lines at the fixed leading', () => {
	const field = 8 + 20 + 20 + 8;

	expect(COMPLEX_TILE_HEIGHT).toBe(32 + 32 + 12 + (field + 8 + field));

	card({ ...COMPLEX, unitCount: 3, vacantUnitCount: 1 });

	expect(document.querySelector('[data-layout=tile]')?.classList).toContain('gap-3');
});
