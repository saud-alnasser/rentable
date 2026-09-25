import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { placeholderStrings as strings } from '$lib/design/tests/strings';
import en from '$lib/i18n/en';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import QueryProviders from '#tests/query-providers.svelte';
import PaymentForm from '$lib/payment/component/form.svelte';

/**
 * THE PAYMENT FORM, OPENED ON A NEW PAYMENT
 *
 * Requirement 16 of effort 832, criterion 16(a): a field the application can fill is filled. A new
 * payment opens on today and on the amount due this cycle, capped at what the contract still owes,
 * so the reader recording an ordinary rent confirms two figures rather than typing them.
 *
 * **The contract read is stood in for**, through a partial mock of the contract's query module:
 * what it answers is the test's to set (`read`). The payment's own mutations are stood in for as
 * well, since nothing here submits. Today is fixed, so the cycle the contract is in is known.
 */

const { read, submitted } = vi.hoisted(() => ({
	read: { contract: undefined as unknown },
	/** what each submit handed the payment's mutations, in order. */
	submitted: [] as Record<string, unknown>[]
}));

vi.mock('$lib/contract/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/contract/query')>()),
	useFetchContract: () => ({
		isPending: false,
		get data() {
			return read.contract;
		}
	})
}));

vi.mock('$lib/payment/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/payment/query')>()),
	useCreatePayment: () => ({
		isPending: false,
		mutateAsync: async (variables: Record<string, unknown>) => {
			submitted.push(variables);

			return { id: 'payment-1' };
		}
	}),
	useUpdatePayment: () => ({
		isPending: false,
		mutateAsync: async (variables: Record<string, unknown>) => {
			submitted.push(variables);
		}
	})
}));

loadLocale('en');
setLocale('en');

// the middle of March, in a monthly contract that started in January: the third cycle.
const TODAY = new Date('2026-03-15T09:00:00.000Z');

const monthly = {
	id: 'contract-1',
	govId: '4471',
	status: 'active',
	start: Date.UTC(2026, 0, 1),
	end: Date.UTC(2026, 11, 31),
	interval: '1m',
	cost: 1500,
	expectedAmount: 18000,
	tenantId: 'tenant-1'
};

beforeEach(() => {
	// Date alone: the surface's own timers are left to run.
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(TODAY);
});

afterEach(() => {
	vi.useRealTimers();
	document.body.innerHTML = '';
	submitted.length = 0;
});

type Opened = { contractId: string; date: number; amount: number } & Record<string, unknown>;

const open = (value?: Opened) =>
	render(
		PaymentForm,
		{ contractId: 'contract-1', value, open: true, onOpenChange: () => {} },
		{ wrapper: QueryProviders, wrapperProps: { strings, direction: 'ltr' } }
	);

/** the date the form will submit, as it holds it. */
const date = () => document.querySelector<HTMLInputElement>('input[name=date]')?.value;

/** the amount field, the one money input on the surface. */
const amount = () => document.querySelector<HTMLInputElement>('input[inputmode=decimal]')?.value;

test('a new payment opens on today and on the amount due this cycle', async () => {
	read.contract = { ...monthly, paidAmount: 4000 };

	open();

	// three cycles are due by the middle of March and 4000 is paid, so 500 of this one remains.
	await waitFor(() => expect(amount()).toBe('500'));
	expect(date()).toBe('2026-03-15');
});

test('the amount due is capped at what the contract still owes', async () => {
	// the last 1000 of the contract, paid well ahead of the cycles it covers.
	read.contract = { ...monthly, paidAmount: 17000 };

	open();

	await waitFor(() => expect(amount()).toBe('1000'));
	expect(date()).toBe('2026-03-15');
});

// --- How it was paid ------------------------------------------------------------------
//
// Ticket 03 of [[efforts/835-the-rent-is-receipted-scheduled-and-chased/spec]], criterion 1(a): the
// form offers the four methods and leaves none chosen, and a reference and a note beside them.

/** the method's segments, in the order they are drawn. */
const methods = () => [
	...document.querySelectorAll<HTMLButtonElement>('[data-slot="toggle-group-item"]')
];

/** the segments pressed now, by their label. */
const pressed = () =>
	methods()
		.filter((segment) => segment.getAttribute('data-state') === 'on')
		.map((segment) => segment.textContent?.trim());

const reference = () =>
	document.querySelector<HTMLInputElement>(
		`input[placeholder="${en.contracts.payments.referencePlaceholder}"]`
	);

const note = () => document.querySelector<HTMLTextAreaElement>('textarea');

const submit = async () => {
	const button = document.querySelector<HTMLButtonElement>('button[type=submit]');

	await fireEvent.click(button!);
};

test('the four methods are offered as one group, and none is chosen', async () => {
	read.contract = { ...monthly, paidAmount: 0 };

	open();

	await waitFor(() => expect(methods()).toHaveLength(4));

	expect(methods().map((segment) => segment.textContent?.trim())).toEqual([
		en.contracts.payments.methods.cash,
		en.contracts.payments.methods.bankTransfer,
		en.contracts.payments.methods.cheque,
		en.contracts.payments.methods.ejar
	]);
	expect(pressed()).toEqual([]);
	// a reference as a line, and a note as text that may run to several.
	expect(reference()).toBeTruthy();
	expect(note()).toBeTruthy();
	// optional, and labelled so.
	expect(document.body.textContent).toContain(en.contracts.payments.methodOptional);
	expect(document.body.textContent).toContain(en.contracts.payments.referenceOptional);
	expect(document.body.textContent).toContain(en.contracts.payments.noteOptional);
});

test('a chosen method is let go by pressing it again', async () => {
	read.contract = { ...monthly, paidAmount: 0 };

	open();

	await waitFor(() => expect(methods()).toHaveLength(4));

	await fireEvent.click(methods()[2]);
	await waitFor(() => expect(pressed()).toEqual([en.contracts.payments.methods.cheque]));

	await fireEvent.click(methods()[2]);
	await waitFor(() => expect(pressed()).toEqual([]));
});

test('a new payment is saved with what was chosen and written, and blanks as nothing', async () => {
	read.contract = { ...monthly, paidAmount: 0 };

	open();

	await waitFor(() => expect(amount()).toBe('1500'));

	await fireEvent.click(methods()[3]);
	await fireEvent.input(reference()!, { target: { value: 'SADAD-7731' } });
	await submit();

	await waitFor(() => expect(submitted).toHaveLength(1));
	expect(submitted[0]).toMatchObject({
		contractId: 'contract-1',
		amount: 1500,
		method: 'ejar',
		reference: 'SADAD-7731',
		note: null
	});
});

test('an edit opens on what the payment holds, and clearing it saves nothing in its place', async () => {
	read.contract = { ...monthly, paidAmount: 1500 };

	open({
		id: 'payment-1',
		contractId: 'contract-1',
		date: Date.UTC(2026, 2, 1),
		amount: 1500,
		method: 'bank-transfer',
		reference: 'TRF-9',
		note: 'for March'
	});

	await waitFor(() => expect(pressed()).toEqual([en.contracts.payments.methods.bankTransfer]));
	expect(reference()?.value).toBe('TRF-9');
	expect(note()?.value).toBe('for March');

	await fireEvent.click(methods()[1]);
	await fireEvent.input(reference()!, { target: { value: '' } });
	await fireEvent.input(note()!, { target: { value: '' } });
	await submit();

	await waitFor(() => expect(submitted).toHaveLength(1));
	expect(submitted[0]).toMatchObject({
		id: 'payment-1',
		method: null,
		reference: null,
		note: null
	});
});

// criterion 1(c): a payment written before the columns existed opens and saves.
test('a payment holding none of the three opens with none chosen and saves', async () => {
	read.contract = { ...monthly, paidAmount: 1500 };

	open({
		id: 'payment-1',
		contractId: 'contract-1',
		date: Date.UTC(2026, 2, 1),
		amount: 1500,
		method: null,
		reference: null,
		note: null
	});

	await waitFor(() => expect(methods()).toHaveLength(4));
	expect(pressed()).toEqual([]);
	expect(reference()?.value).toBe('');

	await submit();

	await waitFor(() => expect(submitted).toHaveLength(1));
	expect(submitted[0]).toMatchObject({ id: 'payment-1', amount: 1500, method: null });
});
