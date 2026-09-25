import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';

import ContractDirectory from '$lib/contract/component/directory.svelte';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import en from '$lib/i18n/en';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import QueryProviders from '#tests/query-providers.svelte';
import { forgetReader, holdEveryFlagBut, layOutLists } from '#tests/permission.ts';

/**
 * THE CONTRACTS DIRECTORY, FOR A READER WHO MAY NOT VIEW TENANTS OR PAYMENTS
 *
 * Effort 838, requirement 10 and criterion 10: `contract.getMany` answers a reader who may not view
 * tenants with no tenant's name or phone, and one who may not view payments with no count of them
 * (the router test covers both). The directory draws such a row whole: the card leads with the
 * contract's own reference rather than a tenant, draws no figure where the count stood, and offers
 * no order by the tenant.
 *
 * **The read is the mock**, answering with the row the router answers each reader with.
 */

const CONTRACT = {
	id: 'contract-1',
	govId: '4471',
	status: 'active' as const,
	start: Date.UTC(2026, 0, 1),
	end: Date.UTC(2026, 11, 31),
	interval: '1m' as const,
	cost: 1500,
	paidAmount: 0,
	expectedAmount: 18000,
	tenantId: 'tenant-1'
};

const { rows } = vi.hoisted(() => ({ rows: { current: [] as object[] } }));

vi.mock('$lib/contract/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/contract/query')>()),
	useListContracts: () => ({ data: rows.current, isLoading: false, isFetching: false }),
	usePlanManyContracts: () => ({ data: undefined })
}));

vi.mock('$app/state', () => ({
	page: { route: { id: '/contracts' }, url: new URL('http://localhost/contracts') }
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
		ContractDirectory,
		{},
		{ wrapper: QueryProviders, wrapperProps: { strings, direction: 'ltr' as const } }
	);

/** the card's link, whose name is what the card leads with. */
const card = () => document.querySelector<HTMLAnchorElement>('a[href$="/contracts/contract-1"]');

/** what a screen reader hears of each count on the rows. */
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

test('a row carrying its tenant and its payments leads with the tenant and counts them', async () => {
	holdEveryFlagBut();
	rows.current = [
		{ ...CONTRACT, tenantName: 'Noura', tenantPhone: '+966500000001', paymentCount: 2 }
	];
	directory();

	await waitFor(() => expect(card()).not.toBeNull());

	expect(card()?.getAttribute('aria-label') ?? card()?.textContent).toContain('Noura');
	expect(document.body.textContent).toContain('4471');
	expect(figures()).toContain(`${en.common.nav.payments}: 2`);
	expect(await offeredOrders()).toContain(en.common.labels.tenant);
});

test('without viewing tenants or payments, a row leads with its reference, names nobody and counts nothing', async () => {
	holdEveryFlagBut('viewTenant', 'viewPayment');
	rows.current = [CONTRACT];
	directory();

	await waitFor(() => expect(card()).not.toBeNull());

	const said = document.body.textContent ?? '';

	// led by the contract's own reference, once, and never by a stand-in for the tenant.
	expect(card()?.getAttribute('aria-label') ?? card()?.textContent).toContain('4471');
	expect(said.split('4471')).toHaveLength(2);
	expect(said).not.toContain('Noura');
	expect(said.toLowerCase()).not.toContain(en.common.labels.tenant);
	expect(figures()).toEqual([]);
	expect(await offeredOrders()).not.toContain(en.common.labels.tenant);
});
