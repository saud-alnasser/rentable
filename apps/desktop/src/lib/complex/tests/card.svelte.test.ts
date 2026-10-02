import { render } from '@testing-library/svelte';
import { afterEach, beforeEach, expect, test } from 'vitest';

import ComplexCard from '$lib/complex/component/card.svelte';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import Providers from '#tests/providers.svelte';

/**
 * A COMPLEX'S TILE
 *
 * Ticket 17 of [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], requirement 19
 * and criterion 19: a complex's tile carries its name, its location and its unit counts, every
 * fact with its glyph and every count with its word, and no count of zero. What it holds was fixed
 * on real data by ticket 15.
 */

const COMPLEX = { id: 'complex-1', name: 'Palm Court', location: 'Riyadh' };

beforeEach(() => {
	loadLocale('en');
	loadLocale('ar');
	setLocale('en');
});

afterEach(() => {
	document.body.innerHTML = '';
});

const card = (complex: object) =>
	render(
		ComplexCard,
		// the record as `complex.getMany` answers it; the test passes only the fields the tile reads.
		{ complex: complex as never, href: '/complexes/complex-1', actions: [] },
		{ wrapper: Providers, wrapperProps: { strings, direction: 'ltr' as const } }
	);

/** each fact the tile draws, as its words. */
const facts = () =>
	[...document.querySelectorAll<HTMLElement>('[data-fact]')].map((fact) =>
		fact.textContent?.replace(/\s+/g, ' ').trim()
	);

test('a complex tile names the complex and draws every fact with its glyph', () => {
	card({ ...COMPLEX, unitCount: 3, vacantUnitCount: 1 });

	expect(document.querySelector('[data-layout=tile]')?.textContent).toContain('Palm Court');
	expect(facts()).toEqual(['Riyadh', '3 units', '2 occupied', '1 vacant']);

	for (const fact of document.querySelectorAll('[data-fact]')) {
		expect(fact.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
	}
});

test('a count is worded for its figure', () => {
	card({ ...COMPLEX, unitCount: 1, vacantUnitCount: 0 });

	expect(facts()).toContain('1 unit');
});

test('a count of zero is not drawn', () => {
	card({ ...COMPLEX, unitCount: 2, vacantUnitCount: 0 });

	expect(facts()).toEqual(['Riyadh', '2 units', '2 occupied']);

	document.body.innerHTML = '';
	card({ ...COMPLEX, unitCount: 2, vacantUnitCount: 2 });

	expect(facts()).toEqual(['Riyadh', '2 units', '2 vacant']);
});

test('a complex holding no units draws no counts at all', () => {
	card({ ...COMPLEX, unitCount: 0, vacantUnitCount: 0 });

	expect(facts()).toEqual(['Riyadh']);
	expect(document.body.textContent).not.toMatch(/\b0\b/);
});

// effort 838, requirement 10: a reader who may not view units is answered with no counts, and the
// tile reads as a complex with nothing counted rather than as an empty one.
test('without the unit counts, the tile draws none', () => {
	card(COMPLEX);

	expect(facts()).toEqual(['Riyadh']);
});

// the arabic plural has six forms, and a form left out reads as nothing for the counts that
// select it; two is the one english has no form for.
test('in arabic, every count reads with its word', () => {
	setLocale('ar');

	for (const [count, word] of [
		[1, 'وحدة'],
		[2, 'وحدتان'],
		[3, 'وحدات'],
		[11, 'وحدة'],
		[100, 'وحدة']
	] as const) {
		document.body.innerHTML = '';
		card({ ...COMPLEX, unitCount: count, vacantUnitCount: 0 });

		expect(facts()[1]).toBe(`${count} ${word}`);
	}
});
