import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';

import { placeholderStrings as strings } from '$lib/design/tests/strings';
import en from '$lib/i18n/en';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import TenantDirectory from '$lib/tenant/component/directory.svelte';
import QueryProviders from '#tests/query-providers.svelte';
import { forgetReader, holdEveryFlagBut, layOutLists } from '#tests/permission.ts';

/**
 * THE TENANTS DIRECTORY, FOR A READER WHO MAY NOT VIEW CONTRACTS
 *
 * Effort 838, requirement 10 and criterion 10: `tenant.getMany` answers a reader who may not view
 * contracts with no count of them (the router test covers that), and the directory draws such a
 * row whole, with no figure where the counts stood and no order by them offered.
 *
 * **The read is the mock**, answering with the row the router answers each reader with.
 */

const COUNTS = {
	contractsScheduled: 0,
	contractsActive: 2,
	contractsFulfilled: 0,
	contractsDefaulted: 1,
	contractsExpired: 0,
	contractsTerminated: 0
};

const TENANT = { id: 'tenant-1', name: 'Sara', nationalId: '1000000000', phone: '+966500000000' };

const { rows } = vi.hoisted(() => ({ rows: { current: [] as object[] } }));

vi.mock('$lib/tenant/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/tenant/query')>()),
	useListTenants: () => ({ data: rows.current, isLoading: false, isFetching: false }),
	usePlanManyTenants: () => ({ data: undefined })
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
		TenantDirectory,
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

test('a row carrying its counts draws a figure per status', async () => {
	holdEveryFlagBut();
	rows.current = [{ ...TENANT, ...COUNTS }];
	directory();

	await waitFor(() => expect(document.body.textContent).toContain('Sara'));

	expect(figures()).toContain(`${en.common.status.active}: 2`);
	expect(await offeredOrders()).toContain(en.common.labels.activeContracts);
});

test('without viewing contracts, a row draws no figure where its counts stood, and offers no order by them', async () => {
	holdEveryFlagBut('viewContract');
	rows.current = [TENANT];
	directory();

	await waitFor(() => expect(document.body.textContent).toContain('Sara'));

	// the tenant's own fields are the row, whole.
	expect(document.body.textContent).toContain('1000000000');
	expect(figures()).toEqual([]);
	expect(await offeredOrders()).not.toContain(en.common.labels.activeContracts);
});
