import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';

import { COMPLEX_TILE_HEIGHT } from '$lib/complex/component/card.svelte';
import ComplexDirectory from '$lib/complex/component/directory.svelte';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import en from '$lib/i18n/en';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import Providers from '#tests/providers.svelte';
import { forgetReader, holdEveryFlagBut, layOutLists } from '#tests/permission.ts';

/**
 * THE COMPLEXES DIRECTORY, FOR A READER WHO MAY NOT VIEW UNITS
 *
 * Effort 838, requirement 10 and criterion 10: `complex.getMany` answers a reader who may not view
 * units with no count of them (the router test covers that), and the directory draws such a row
 * whole, with no figure where the counts stood and no order by them offered.
 *
 * **The read is the mock**, answering with the row the router answers each reader with.
 */

const COMPLEX = { id: 'complex-1', name: 'Palm Court', location: 'Riyadh' };

const { rows } = vi.hoisted(() => ({ rows: { current: [] as object[] } }));

vi.mock('$lib/complex/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/complex/query')>()),
	useListComplexes: () => ({ data: rows.current, isLoading: false, isFetching: false }),
	usePlanManyComplexes: () => ({ data: undefined })
}));

beforeAll(layOutLists);

beforeEach(() => {
	loadLocale('en');
	setLocale('en');
	// jsdom lays nothing out, so the list is given a viewport its rows can be drawn into.
	vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(800);
	vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(600);
});

afterEach(() => {
	vi.restoreAllMocks();
	forgetReader();
	document.body.innerHTML = '';
});

const directory = () =>
	render(
		ComplexDirectory,
		{},
		{ wrapper: Providers, wrapperProps: { strings, direction: 'ltr' as const } }
	);

/** each count the tiles draw, as its field's name and its value. */
const figures = () =>
	[...document.querySelectorAll<HTMLElement>('[data-complex-field]')]
		.filter((field) =>
			field.querySelector('[data-complex-units], [data-complex-occupied], [data-complex-vacant]')
		)
		.map(
			(field) =>
				`${field.querySelector('[data-field-name]')?.textContent?.trim()}: ${field.querySelector('[data-field-value]')?.textContent?.trim()}`
		);

const offeredOrders = async () => {
	await fireEvent.click(document.querySelector<HTMLElement>('[data-sort-control]')!);

	return [...document.querySelectorAll<HTMLElement>('[data-slot=dropdown-menu-item]')].map((item) =>
		item.textContent?.trim()
	);
};

test('a tile carrying its unit counts draws them', async () => {
	holdEveryFlagBut();
	rows.current = [{ ...COMPLEX, unitCount: 3, vacantUnitCount: 1 }];
	directory();

	await waitFor(() => expect(document.body.textContent).toContain('Palm Court'));

	expect(figures()).toEqual(['units: 3', 'occupied: 2', 'vacant: 1']);
	expect(await offeredOrders()).toContain(en.common.labels.vacantUnits);
});

test('without viewing units, a tile draws no figure where its counts stood, and offers no order by them', async () => {
	holdEveryFlagBut('viewUnit');
	rows.current = [COMPLEX];
	directory();

	await waitFor(() => expect(document.body.textContent).toContain('Palm Court'));

	// the complex's own fields are the tile, whole.
	expect(document.body.textContent).toContain('Riyadh');
	expect(figures()).toEqual([]);
	expect(await offeredOrders()).toEqual([en.common.labels.name, en.common.labels.location]);
});

/**
 * Ticket 17 of [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], requirement 18
 * and criterion 18: the complexes directory lays its records as tiles in the grid, at the tile's
 * fixed height. The width it is given here is the shell's to divide (`columnsFor`, tested in
 * `list/`); what this holds is that the directory turned the grid on.
 */
test('the complexes directory draws its records as tiles in the grid', async () => {
	holdEveryFlagBut();
	rows.current = [
		{ ...COMPLEX, unitCount: 3, vacantUnitCount: 1 },
		{ id: 'complex-2', name: 'Olive Yard', location: 'Jeddah', unitCount: 2, vacantUnitCount: 0 }
	];
	directory();

	await waitFor(() => expect(document.body.textContent).toContain('Olive Yard'));

	expect(document.querySelectorAll('[data-layout=tile]')).toHaveLength(2);

	// ticket 43: the list lays each row at the tile's declared height, the gap below it apart.
	const holders = [...document.querySelectorAll<HTMLElement>('[data-index]')];

	expect(holders.length).toBeGreaterThan(0);

	for (const holder of holders) {
		expect(parseFloat(holder.style.height) - parseFloat(holder.style.paddingBottom)).toBe(
			COMPLEX_TILE_HEIGHT
		);
	}
});
