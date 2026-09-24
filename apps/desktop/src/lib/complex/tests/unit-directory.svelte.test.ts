import { fireEvent, render } from '@testing-library/svelte';
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';

import UnitDirectory from '$lib/complex/component/unit-directory.svelte';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import en from '$lib/i18n/en';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import QueryProviders from '$lib/organization/tests/query-providers.svelte';
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

const { reads } = vi.hoisted(() => ({
	reads: { sort: null as null | (() => ListSort | null) }
}));

vi.mock('$lib/complex/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/complex/query')>()),
	useListUnits: (_complexId: () => string, _search: () => string, sort: () => ListSort | null) => {
		reads.sort = sort;

		return {
			isLoading: false,
			isFetching: false,
			data: [
				{ id: 'unit-1', name: 'A1', complexId: 'complex-1', status: 'vacant', tenantName: null }
			]
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
});

afterEach(() => {
	document.body.innerHTML = '';
});

const directory = () =>
	render(
		UnitDirectory,
		{ complexId: 'complex-1', complexName: 'Palm Court' },
		{ wrapper: QueryProviders, wrapperProps: { strings, direction: 'ltr' as const } }
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
