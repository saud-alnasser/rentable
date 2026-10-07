import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';

import { placeholderStrings as strings } from '$lib/design/tests/strings';
import en from '$lib/i18n/en';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import Providers from '#tests/providers.svelte';
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

/** the contract every test but the refund ones reads: terminated, and paid nothing. */
const TERMINATED = {
	id: 'contract-1',
	status: 'terminated',
	govId: '1001',
	tenantName: 'Noura',
	paidAmount: 0,
	expectedAmount: 12000
};

const { reads, created } = vi.hoisted(() => ({
	reads: {
		contract: undefined as unknown,
		payments: null as null | (() => { sort?: ListSort | null }),
		rows: [] as {
			id: string;
			date: number;
			amount: number;
			contractId: string;
			direction?: 'received' | 'refund';
			method?: string | null;
			reference?: string | null;
			note?: string | null;
		}[]
	},
	created: [] as unknown[]
}));

vi.mock('$lib/contract/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/contract/query')>()),
	useFetchContract: () => ({
		isLoading: false,
		get data() {
			return reads.contract;
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
	reads.contract = TERMINATED;
	reads.payments = null;
	reads.rows = [];
	created.length = 0;
});

afterEach(() => {
	document.body.innerHTML = '';
	vi.restoreAllMocks();
});

const ledger = () =>
	render(
		Ledger,
		{ recordId: 'contract-1' },
		{ wrapper: Providers, wrapperProps: { strings, direction: 'ltr' as const } }
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

// ticket 19 of [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], requirement 20: a
// row says how the payment was made where that was recorded, and stays the day and the amount alone
// where it was not. The months and their totals stay over the rows.
test('a row says how it was paid, and one recorded without it is the day and the amount', async () => {
	reads.rows = [
		{
			id: 'paid-by-cheque',
			date: Date.UTC(2026, 2, 14),
			amount: 1500,
			contractId: 'contract-1',
			method: 'cheque',
			reference: 'CHQ-0042',
			note: 'handed over at the office'
		},
		{ id: 'paid-bare', date: Date.UTC(2026, 1, 3), amount: 900, contractId: 'contract-1' }
	];

	// the list draws only the rows in its viewport, and jsdom measures nothing.
	vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(800);
	vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(600);

	ledger();

	/** the card a payment's link sits on. */
	const row = (id: string) =>
		document.querySelector(`a[href$="/contracts/payments/${id}"]`)?.parentElement as HTMLElement;

	await waitFor(() => expect(row('paid-by-cheque')).toBeTruthy());

	const described = row('paid-by-cheque');
	const method = described.querySelector('[data-payment-method]');

	expect(method?.textContent?.trim()).toBe(en.contracts.payments.methods.cheque);
	// the glyph is beside the word, and silent.
	expect(method?.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
	expect(described.querySelector('[data-payment-reference] [dir=ltr]')?.textContent).toBe(
		'CHQ-0042'
	);
	expect(described.querySelector('[data-payment-note]')?.textContent).toContain(
		'handed over at the office'
	);

	const bare = row('paid-bare');

	expect(bare.querySelector('[data-payment-how]'), 'no second line, and no empty slot').toBeNull();
	expect(bare.querySelector('svg.lucide-hand-coins, svg.lucide-landmark')).toBeNull();
	expect(bare.textContent).toContain('900');

	// a month header with its total over each month's rows, as before: two months, two headers.
	const totals = [...document.querySelectorAll('.sr-only')].filter((node) =>
		node.textContent?.includes(en.contracts.payments.monthTotal.replace(' {month}', ''))
	);

	expect(totals).toHaveLength(2);
});

// --- Refunds --------------------------------------------------------------------------
//
// Ticket 24 of [[efforts/854-bugs-and-edge-cases-across-the-app/spec]], requirements 25 and 26 and
// their criteria, the interface half: a refund is recorded from the ledger, reads there as money
// going out, and a received payment locked by its terminated contract says why and what unlocks it.

/** lay the list out so it draws its rows, which jsdom would otherwise measure at nothing. */
function layOut() {
	vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(800);
	vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(600);
}

/** the card a payment's link sits on. */
const row = (id: string) =>
	document.querySelector(`a[href$="/contracts/payments/${id}"]`)?.parentElement as HTMLElement;

/** the bar's create control. */
const createControl = () => document.querySelector<HTMLElement>('[data-create-control]');

test('a refund reads as money going out, tagged and signed, and its month states both', async () => {
	reads.contract = { ...TERMINATED, status: 'active', paidAmount: 12600 };
	reads.rows = [
		{
			id: 'returned',
			date: Date.UTC(2026, 2, 20),
			amount: 400,
			contractId: 'contract-1',
			direction: 'refund'
		},
		{ id: 'received', date: Date.UTC(2026, 2, 14), amount: 1500, contractId: 'contract-1' },
		{ id: 'february', date: Date.UTC(2026, 1, 3), amount: 900, contractId: 'contract-1' }
	];
	layOut();

	ledger();

	await waitFor(() => expect(row('returned')).toBeTruthy());

	const refund = row('returned');
	const received = row('received');

	expect(refund.querySelector('[data-payment-refund]')?.textContent?.trim()).toBe(
		en.contracts.payments.refund.tag
	);
	expect(refund.querySelector('[data-payment-amount]')?.textContent).toMatch(/-400/);
	expect(received.querySelector('[data-payment-refund]')).toBeNull();
	expect(received.querySelector('[data-payment-amount]')?.textContent).not.toMatch(/-/);

	// March received 1,500 and returned 400, stated apart and never netted; February returned
	// nothing, and says only what it received.
	const headers = [...document.querySelectorAll<HTMLElement>('[data-ledger-month]')];

	expect(headers).toHaveLength(2);

	const [march, february] = headers;

	expect(march.querySelector('[data-month-received]')?.textContent).toMatch(/1,500/);
	expect(march.querySelector('[data-month-returned]')?.textContent).toMatch(/400/);
	expect(march.textContent).toContain(en.contracts.payments.refund.monthReturned);
	expect(february.querySelector('[data-month-received]')?.textContent).toMatch(/900/);
	expect(february.querySelector('[data-month-returned]')).toBeNull();
});

// the human, 2026-10-07: the bar keeps its one plus, and a payment and a refund are the payment
// form's two tabs. So the plus opens the form wherever the contract takes either one.
test('the plus opens the payment form on a terminated contract that received money', async () => {
	reads.contract = { ...TERMINATED, paidAmount: 5000 };

	ledger();

	const control = createControl();

	expect(document.querySelector('[data-refund-create]'), 'no refund control of its own').toBeNull();
	// no new payment, but a refund to make, so the plus is not refused.
	expect(control?.getAttribute('aria-disabled')).toBeNull();
	expect(control?.getAttribute('aria-label')).toBe(en.common.actions.newPayment);

	await fireEvent.click(control!);

	expect(created).toEqual([{ contractId: 'contract-1' }]);
});

test("the plus is refused, with the payment's reason, where neither a payment nor a refund may be made", async () => {
	// paid exactly its total: no new payment, and a refund would leave it owing.
	reads.contract = { ...TERMINATED, status: 'fulfilled', paidAmount: 12000 };

	ledger();

	const control = createControl();

	expect(control?.getAttribute('aria-disabled')).toBe('true');
	expect(describedBy(control)).toBe(en.contracts.payments.fullyPaidNotice);

	await fireEvent.click(control!);

	expect(created).toEqual([]);
});

test("a received payment on a terminated contract says why it is locked; a refund's row does not", async () => {
	reads.contract = { ...TERMINATED, paidAmount: 4000 };
	reads.rows = [
		{
			id: 'returned',
			date: Date.UTC(2026, 2, 20),
			amount: 1000,
			contractId: 'contract-1',
			direction: 'refund'
		},
		{ id: 'received', date: Date.UTC(2026, 2, 14), amount: 5000, contractId: 'contract-1' }
	];
	layOut();

	ledger();

	await waitFor(() => expect(row('received')).toBeTruthy());

	expect(row('received').querySelector('[data-payment-locked]')?.textContent?.trim()).toBe(
		en.contracts.payments.refund.locked
	);
	expect(row('returned').querySelector('[data-payment-locked]')).toBeNull();
});

test('a contract still running locks no row', async () => {
	reads.contract = { ...TERMINATED, status: 'active', paidAmount: 4000 };
	reads.rows = [
		{ id: 'received', date: Date.UTC(2026, 2, 14), amount: 4000, contractId: 'contract-1' }
	];
	layOut();

	ledger();

	await waitFor(() => expect(row('received')).toBeTruthy());

	expect(row('received').querySelector('[data-payment-locked]')).toBeNull();
});
