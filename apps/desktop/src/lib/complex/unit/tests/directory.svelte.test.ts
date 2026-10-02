import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';

// what the other features contribute to the directory, composed and provided as the frame does by
// importing them (`contributionsTo` in `$lib/feature/surface`).
import '$lib/app/surfaces';
import UnitDirectory from '$lib/complex/unit/component/directory.svelte';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import en from '$lib/i18n/en';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import Providers from '#tests/providers.svelte';
import { forgetReader, holdEveryFlagBut } from '#tests/permission.ts';
import type { ListSort } from '@rentable/design/sort.js';

/**
 * A COMPLEX'S UNITS, ORDERED
 *
 * Ticket 30 of [[efforts/832-the-interface-speaks-one-language-and-guides/spec]], from its walk:
 * the unit directory was the one list besides the ledger that offered no order. It offers the
 * list shell's sort control now, by what a unit's card shows, and the order chosen is the one the
 * units are read in.
 *
 * **The reads are the mock**: what the directory hands its units read is recorded, so a chosen
 * order is read off the question the read would be asked.
 */

const VACANT = {
	id: 'unit-1',
	name: 'A1',
	complexId: 'complex-1',
	status: 'vacant',
	tenantName: null
};

const { reads } = vi.hoisted(() => ({
	reads: { sort: null as null | (() => ListSort | null), rows: [] as object[] }
}));

vi.mock('$lib/complex/unit/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/complex/unit/query')>()),
	useListUnits: (_complexId: () => string, _search: () => string, sort: () => ListSort | null) => {
		reads.sort = sort;

		return {
			isLoading: false,
			isFetching: false,
			data: reads.rows
		};
	},
	useDeleteManyUnits: () => ({ mutateAsync: async () => ({ deleted: [] }) }),
	usePlanManyUnits: () => ({ data: undefined })
}));

vi.mock('$lib/workspace/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/workspace/query')>()),
	useImportRecords: () => ({ mutateAsync: async () => {} })
}));

beforeAll(() => {
	Element.prototype.scrollIntoView ??= () => {};
	window.ResizeObserver ??= class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
});

beforeEach(() => {
	loadLocale('en');
	setLocale('en');
	reads.sort = null;
	reads.rows = [VACANT];
});

afterEach(() => {
	vi.restoreAllMocks();
	forgetReader();
	document.body.innerHTML = '';
});

const directory = () =>
	render(
		UnitDirectory,
		{ complexId: 'complex-1', complexName: 'Palm Court' },
		{ wrapper: Providers, wrapperProps: { strings, direction: 'ltr' as const } }
	);

const offeredOrders = () =>
	[...document.querySelectorAll<HTMLElement>('[data-slot=dropdown-menu-item]')].map((item) =>
		item.textContent?.trim()
	);

test('the unit directory offers the sort every list offers, by what its cards show', async () => {
	directory();

	await fireEvent.click(document.querySelector<HTMLElement>('[data-sort-control]')!);

	expect(offeredOrders()).toEqual([
		en.common.labels.name,
		en.common.labels.tenant,
		en.common.labels.status
	]);
});

test('a chosen order is the one the units are read in', async () => {
	directory();

	expect(reads.sort?.()).toBeNull();

	await fireEvent.click(document.querySelector<HTMLElement>('[data-sort-control]')!);
	const tenant = [...document.querySelectorAll<HTMLElement>('[data-slot=dropdown-menu-item]')].find(
		(item) => item.textContent?.trim() === en.common.labels.tenant
	);
	await fireEvent.click(tenant!);

	expect(reads.sort?.()).toEqual({ columnId: 'tenantName', direction: 'asc' });
});

/**
 * Effort 838, requirement 10 and criterion 10: `complex.units.getMany` answers a reader who may not
 * view tenants with no occupant at all (the router test covers that). The row is drawn whole, and
 * says nothing where the occupant stood: not the tenant, and not *vacant*, which the unit may not
 * be. Its status is the unit's own and still says whether it is occupied.
 */
test('without viewing tenants, a unit row names no occupant, reads not as vacant, and offers no order by tenant', async () => {
	vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(800);
	vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(600);

	holdEveryFlagBut();
	reads.rows = [
		{ id: 'unit-2', name: 'B1', complexId: 'complex-1', status: 'occupied', tenantName: 'Noura' }
	];
	directory();

	await waitFor(() => expect(document.body.textContent).toContain('Noura'));

	document.body.innerHTML = '';
	holdEveryFlagBut('viewTenant');
	reads.rows = [{ id: 'unit-2', name: 'B1', complexId: 'complex-1', status: 'occupied' }];
	directory();

	await waitFor(() => expect(document.body.textContent).toContain('B1'));

	const card = document.querySelector<HTMLElement>(
		'a[href$="/complexes/units/unit-2"]'
	)!.parentElement!;

	expect(card.textContent).not.toContain('Noura');
	expect(card.textContent?.toLowerCase()).not.toContain(en.common.status.vacant);
	expect(card.textContent?.toLowerCase()).toContain(en.common.status.occupied);

	await fireEvent.click(document.querySelector<HTMLElement>('[data-sort-control]')!);

	expect(offeredOrders()).toEqual([en.common.labels.name, en.common.labels.status]);
});

/**
 * Ticket 17 of [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], requirement 18
 * as narrowed on 2026-10-02 and criterion 18: the complexes directory is a grid, and a complex's
 * units are not. They stay one column of rows at the row height they had, and each row's status
 * carries its word (requirement 19), with the occupant beside the name where there is one.
 */
test('a complex units stay rows, each status showing its word', async () => {
	vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(800);
	vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(1200);

	holdEveryFlagBut();
	reads.rows = [
		VACANT,
		{ id: 'unit-2', name: 'B1', complexId: 'complex-1', status: 'occupied', tenantName: 'Noura' }
	];
	directory();

	await waitFor(() => expect(document.body.textContent).toContain('Noura'));

	expect(document.querySelector('[data-layout=tile]')).toBeNull();
	expect(
		[...document.querySelectorAll('[data-status-labelled]')].map((status) =>
			status.textContent?.trim()
		)
	).toEqual([en.common.status.vacant, en.common.status.occupied]);

	// a vacant unit has no occupant, and its word is said once, by its status.
	const vacant = document.querySelector<HTMLElement>(
		'a[href$="/complexes/units/unit-1"]'
	)!.parentElement!;

	expect(vacant.textContent?.match(new RegExp(en.common.status.vacant, 'g'))).toHaveLength(1);
});
