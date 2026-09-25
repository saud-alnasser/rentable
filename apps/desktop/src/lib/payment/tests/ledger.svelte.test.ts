import { fireEvent, render } from '@testing-library/svelte';
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';

import { placeholderStrings as strings } from '$lib/design/tests/strings';
import en from '$lib/i18n/en';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import QueryProviders from '#tests/query-providers.svelte';
import Ledger from '$lib/payment/component/ledger.svelte';
import type { ListSort } from '@rentable/design/sort.js';

/**
 * A CONTRACT'S LEDGER, ORDERED AND REFUSED
 *
 * Ticket 30 of [[efforts/832-the-interface-speaks-one-language-and-guides/spec]], after its walk:
 * the ledger is a list like every other, so it offers the sort every list offers; and on a
 * contract that takes no new payment, the create its empty state offers is refused with the
 * reason the toolbar's gives, rather than standing enabled beside a toolbar that refuses
 * (requirements 13 and 16).
 *
 * **The reads are the mock.** The contract is a terminated one, and what the ledger hands its
 * payments read is recorded, so a chosen order is read off the question the read would be asked.
 */

const { reads, created } = vi.hoisted(() => ({
	reads: {
		payments: null as null | (() => { sort?: ListSort | null }),
		rows: [] as { id: string; date: number; amount: number; contractId: string }[]
	},
	created: [] as unknown[]
}));

vi.mock('$lib/contract/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/contract/query')>()),
	useFetchContract: () => ({
		isLoading: false,
		data: {
			id: 'contract-1',
			status: 'terminated',
			govId: '1001',
			tenantName: 'Noura',
			paidAmount: 0,
			expectedAmount: 12000
		}
	})
}));

vi.mock('$lib/payment/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/payment/query')>()),
	useListContractPayments: (params: () => { sort?: ListSort | null }) => {
		reads.payments = params;

		return { data: reads.rows, isLoading: false, isFetching: false };
	},
	useDeleteManyPayments: () => ({ mutateAsync: async () => ({ deleted: [] }) }),
	usePlanManyPayments: () => ({ data: undefined })
}));

vi.mock('$lib/workspace/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/workspace/query')>()),
	useImportRecords: () => ({ mutateAsync: async () => {} })
}));

vi.mock('$lib/payment/host.svelte', async (importOriginal) => {
	const original = await importOriginal<typeof import('$lib/payment/host.svelte')>();

	return {
		...original,
		paymentHost: {
			...original.paymentHost,
			create: (prefill: unknown) => created.push(prefill)
		}
	};
});

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
	reads.payments = null;
	reads.rows = [];
	created.length = 0;
});

afterEach(() => {
	document.body.innerHTML = '';
});

const ledger = () =>
	render(
		Ledger,
		{ contractId: 'contract-1' },
		{ wrapper: QueryProviders, wrapperProps: { strings, direction: 'ltr' as const } }
	);

/** what an element's `aria-describedby` names, as assistive technology hears it. */
const describedBy = (element: Element | null) =>
	document.getElementById(element?.getAttribute('aria-describedby') ?? '')?.textContent?.trim();

test('the ledger offers the sort every list offers, by the day and by the amount', async () => {
	ledger();

	await fireEvent.click(document.querySelector<HTMLElement>('[data-sort-control]')!);

	const offered = [...document.querySelectorAll('[data-slot=dropdown-menu-item]')].map((item) =>
		item.textContent?.trim()
	);

	expect(offered).toEqual([en.common.labels.paymentDate, en.common.labels.amount]);
});

test('a chosen order is the one the payments are read in', async () => {
	ledger();

	expect(reads.payments?.().sort ?? null).toBeNull();

	await fireEvent.click(document.querySelector<HTMLElement>('[data-sort-control]')!);
	const amount = [...document.querySelectorAll<HTMLElement>('[data-slot=dropdown-menu-item]')].find(
		(item) => item.textContent?.trim() === en.common.labels.amount
	);
	await fireEvent.click(amount!);

	expect(reads.payments?.().sort).toEqual({ columnId: 'amount', direction: 'asc' });
});

test("a terminated contract's empty ledger refuses its create with the toolbar's reason", async () => {
	ledger();

	const empty = document.querySelector('[data-empty="nothing-yet"]');
	const offered = empty?.querySelector<HTMLElement>('[data-empty-create]');
	const toolbar = document.querySelector<HTMLElement>('[data-create-control]');

	expect(offered, 'the empty state still shows the create, refused').not.toBeNull();
	expect(offered?.getAttribute('aria-disabled')).toBe('true');
	expect(toolbar?.getAttribute('aria-disabled')).toBe('true');
	// one reason, the create act's, on both.
	expect(describedBy(offered!)).toBe(en.contracts.payments.terminatedNotice);
	expect(describedBy(toolbar)).toBe(en.contracts.payments.terminatedNotice);

	// refused, so pressing it asks the host for nothing.
	await fireEvent.click(offered!);
	expect(created).toEqual([]);
});

// ticket 33 of effort 832, from ticket 31's catalogue: the ledger took its import out of the menu on
// a contract that takes no new payment. It stays, refused, with the create's own reason, since an
// import only adds payments ([[rules/interface]], *Export and import*).
test("a terminated contract's ledger shows its import refused, with the create's reason", async () => {
	ledger();

	await fireEvent.click(
		document.querySelector<HTMLElement>(`[aria-label="${en.common.actions.transferData}"]`)!
	);

	const entry = document.querySelector<HTMLElement>('[data-transfer="import"]');

	expect(entry, 'the import is still offered').not.toBeNull();
	expect(entry?.getAttribute('aria-disabled')).toBe('true');
	expect(describedBy(entry)).toBe(en.contracts.payments.terminatedNotice);
});
