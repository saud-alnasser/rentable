import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';

import ComplexDirectory from '$lib/complex/component/directory.svelte';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import en from '$lib/i18n/en';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import QueryProviders from '#tests/query-providers.svelte';
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
		{ wrapper: QueryProviders, wrapperProps: { strings, direction: 'ltr' as const } }
	);

/** what a screen reader hears of each figure on the rows. */
const figures = () =>
	[...document.querySelectorAll('.sr-only')]
		.map((figure) => figure.textContent?.trim() ?? '')
		.filter((said) => /: \d+$/.test(said));

const offeredOrders = async () => {
	await fireEvent.click(document.querySelector<HTMLElement>('[data-sort-control]')!);

	return [...document.querySelectorAll<HTMLElement>('[data-slot=dropdown-menu-item]')].map((item) =>
		item.textContent?.trim()
	);
};

test('a row carrying its unit counts draws them', async () => {
	holdEveryFlagBut();
	rows.current = [{ ...COMPLEX, unitCount: 3, vacantUnitCount: 1 }];
	directory();

	await waitFor(() => expect(document.body.textContent).toContain('Palm Court'));

	expect(figures()).toEqual([
		`${en.common.labels.units}: 3`,
		`${en.common.labels.occupiedUnits}: 2`,
		`${en.common.labels.vacantUnits}: 1`
	]);
	expect(await offeredOrders()).toContain(en.common.labels.vacantUnits);
});

test('without viewing units, a row draws no figure where its counts stood, and offers no order by them', async () => {
	holdEveryFlagBut('viewUnit');
	rows.current = [COMPLEX];
	directory();

	await waitFor(() => expect(document.body.textContent).toContain('Palm Court'));

	// the complex's own fields are the row, whole.
	expect(document.body.textContent).toContain('Riyadh');
	expect(figures()).toEqual([]);
	expect(await offeredOrders()).toEqual([en.common.labels.name, en.common.labels.location]);
});
