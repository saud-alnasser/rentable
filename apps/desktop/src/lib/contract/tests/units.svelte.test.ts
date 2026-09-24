import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { toTitleCase } from '@rentable/design/title-case.js';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import Units from '$lib/contract/component/units.svelte';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import {
	insideTheWait,
	pastTheWait,
	pressSearchKey,
	searchField,
	searchGlass,
	typeSearch
} from '$lib/design/tests/search';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import en from '$lib/i18n/en';
import QueryProviders from '$lib/organization/tests/query-providers.svelte';

/**
 * THE CONTRACT'S UNIT PANES, SEARCHED
 *
 * Criterion 7(a) of [[efforts/832-the-interface-speaks-one-language-and-guides/spec]]: the panes
 * search with the list shell's field, its wait and `/`, where they had a bare input that searched
 * on every keystroke and answered no key.
 *
 * Ticket 30 of the same effort, after its walk: the panes look and act like every other list. The
 * field sits on the surface every set's search sits on, and a pane's units are the record cards
 * every unit list draws, each opening the unit and offering its acts from its menu.
 *
 * **The reads are the mock**, because what the panes hand their read is the search: the
 * assignable read is handed a thunk, and what that thunk answers is what the query would be asked.
 */

const { reads } = vi.hoisted(() => ({
	reads: {
		assignable: null as null | (() => { contractId: string; search: string }),
		units: [] as {
			id: string;
			name: string;
			complexId: string;
			complexName: string;
			status: 'vacant' | 'occupied';
			isAssigned: boolean;
		}[]
	}
}));

vi.mock('$lib/contract/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/contract/query')>()),
	useFetchContract: () => ({ data: { status: 'active', paidAmount: 0 } }),
	useFetchAssignableContractUnits: (args: () => { contractId: string; search: string }) => {
		reads.assignable = args;

		return { data: reads.units, isLoading: false };
	},
	useFetchContractUnits: () => ({ data: [], isFetching: false }),
	useSetContractUnits: () => ({ isPending: false, mutate: () => {} })
}));

/** the search the assignable read is being asked for right now. */
const askedSearch = () => reads.assignable?.().search;

beforeEach(() => {
	loadLocale('en');
	setLocale('en');
	reads.assignable = null;
	reads.units = [];

	window.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
});

afterEach(() => {
	vi.restoreAllMocks();
});

const units = () =>
	render(
		Units,
		{ contractId: 'contract-1' },
		{ wrapper: QueryProviders, wrapperProps: { strings, direction: 'ltr' as const } }
	);

test('the panes lead their search with the glass', () => {
	units();

	expect(searchGlass()).not.toBeNull();
});

test('the panes ask their read for a term only once the reader stops typing', async () => {
	units();

	await typeSearch('A-10');
	await insideTheWait();
	expect(askedSearch()).toBe('');

	await pastTheWait();
	expect(askedSearch()).toBe('A-10');
});

test("the search key puts the cursor in the panes' field", async () => {
	units();

	await pressSearchKey();

	expect(document.activeElement).toBe(searchField());
});

// ticket 30: the field the panes draw is the shared one, glass, wait and key included (read above),
// and it sits on the bar's surface rather than bare over the panes.
test("the panes' field is the shared one, on the surface every set's search sits on", () => {
	units();

	const holder = document.querySelector('[data-pane-search]');

	expect(holder?.querySelector('[data-search-field]')).not.toBeNull();
	expect(holder?.classList.contains('bg-card')).toBe(true);
});

const paneUnit = (id: string) => document.querySelector<HTMLElement>(`[data-pane-unit="${id}"]`);

test("a pane's units are record cards, each opening its unit and offering the unit's acts", async () => {
	reads.units = [
		{
			id: 'held-1',
			name: 'A1',
			complexId: 'complex-1',
			complexName: 'Palm Court',
			status: 'occupied',
			isAssigned: true
		},
		{
			id: 'free-1',
			name: 'B2',
			complexId: 'complex-1',
			complexName: 'Palm Court',
			status: 'vacant',
			isAssigned: false
		}
	];

	// jsdom lays nothing out, so each pane's viewport is given a size the virtualiser can fill.
	vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(800);
	vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(600);

	units();
	await waitFor(() => expect(paneUnit('held-1')).not.toBeNull());

	for (const id of ['held-1', 'free-1']) {
		const card = paneUnit(id);

		expect(card, `the unit ${id} is drawn as a card`).not.toBeNull();
		expect(card?.querySelector('a')?.getAttribute('href')).toBe(`/complexes/units/${id}`);
		// the card's own menu, and the pane's transfer beside it.
		expect(card?.querySelector('[data-transfer]')).not.toBeNull();
	}

	const menu = [...paneUnit('held-1')!.querySelectorAll<HTMLElement>('button')].find((button) =>
		button.textContent?.includes(strings.openMenu)
	);

	expect(menu, "the card's menu").toBeDefined();

	await fireEvent.click(menu!);

	const acts = [...document.querySelectorAll('[data-slot=dropdown-menu-item]')].map((item) =>
		item.getAttribute('data-act')
	);

	expect(acts).toEqual(['unit.copyDetails', 'unit.edit', 'unit.newContract', 'unit.delete']);
	expect(
		[...document.querySelectorAll('[data-slot=dropdown-menu-item]')].map((item) =>
			item.textContent?.trim()
		)
	).toContain(toTitleCase(en.common.actions.edit));
});
