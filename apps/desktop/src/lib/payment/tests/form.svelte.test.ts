import { render, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { placeholderStrings as strings } from '$lib/design/tests/strings';
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

const { read } = vi.hoisted(() => ({
	read: { contract: undefined as unknown }
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
	useCreatePayment: () => ({ isPending: false, mutateAsync: async () => ({ id: 'payment-1' }) }),
	useUpdatePayment: () => ({ isPending: false, mutateAsync: async () => undefined })
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
});

const open = () =>
	render(
		PaymentForm,
		{ contractId: 'contract-1', open: true, onOpenChange: () => {} },
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
