import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { placeholderStrings as strings } from '$lib/design/tests/strings';
import en from '$lib/i18n/en';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import Providers from '#tests/providers.svelte';
import PaymentForm from '$lib/payment/component/form.svelte';

/**
 * THE PAYMENT FORM, CLOSED BEFORE IT IS SAVED
 *
 * Requirement 10 of effort 861: a form with changes asks before it closes, and one with none
 * closes at once. A new payment fills its amount once the contract has been read, after the form
 * has opened, and an edit opens on the payment it edits; neither filling is the reader's.
 *
 * The contract read is stood in for as in `form.svelte.test.ts`, with today fixed so the amount
 * due is known. Nothing here submits.
 */

const { read } = vi.hoisted(() => ({ read: { contract: undefined as unknown } }));

vi.mock('$lib/contract/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/contract/query')>()),
	useFetchContract: () => ({
		isPending: false,
		get data() {
			return read.contract;
		}
	})
}));

// the middle of March, in a monthly contract that started in January: the third cycle.
const TODAY = new Date('2026-03-15T09:00:00.000Z');

const CONTRACT = {
	id: 'contract-1',
	govId: '4471',
	status: 'active',
	start: Date.UTC(2026, 0, 1),
	end: Date.UTC(2026, 11, 31),
	interval: '1m',
	cost: 1500,
	paidAmount: 4000,
	expectedAmount: 18000,
	tenantId: 'tenant-1'
};

const PAYMENT = {
	id: 'payment-1',
	contractId: CONTRACT.id,
	date: Date.UTC(2026, 2, 1),
	amount: 1500,
	direction: 'received' as const,
	method: 'cash' as const,
	reference: null,
	note: null
};

beforeEach(() => {
	loadLocale('en');
	setLocale('en');
	// Date alone: the surface's own timers are left to run.
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(TODAY);
	read.contract = CONTRACT;
});

afterEach(() => {
	vi.useRealTimers();
	document.body.innerHTML = '';
});

const question = () => document.querySelector('[data-confirm-dialog]');

const amount = () => document.querySelector<HTMLInputElement>('input[inputmode=decimal]')!;

const cancel = () =>
	screen
		.getAllByRole('button')
		.find((button) => button.textContent?.trim() === en.common.actions.cancel)!;

function open(value?: typeof PAYMENT) {
	const onOpenChange = vi.fn();

	render(
		PaymentForm,
		{ contractId: CONTRACT.id, value, open: true, onOpenChange },
		{ wrapper: Providers, wrapperProps: { strings, direction: 'ltr' } }
	);

	return onOpenChange;
}

test('a new payment with its amount filled for it closes without asking', async () => {
	const onOpenChange = open();

	// three cycles are due by the middle of March and 4000 is paid, so 500 of this one remains.
	await waitFor(() => expect(amount().value).toBe('500'));
	await fireEvent.click(cancel());

	await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
	expect(question()).toBeNull();
});

test('a new payment with its amount changed asks before closing', async () => {
	const onOpenChange = open();

	await waitFor(() => expect(amount().value).toBe('500'));
	await fireEvent.input(amount(), { target: { value: '450' } });
	await fireEvent.click(cancel());

	await waitFor(() => expect(question()).not.toBeNull());
	expect(onOpenChange).not.toHaveBeenCalled();
});

test('an edit nobody has touched closes without asking', async () => {
	const onOpenChange = open(PAYMENT);

	await waitFor(() => expect(amount().value).toBe('1500'));
	await fireEvent.click(cancel());

	await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
	expect(question()).toBeNull();
});

test('an edit with its amount changed asks before closing', async () => {
	const onOpenChange = open(PAYMENT);

	await waitFor(() => expect(amount().value).toBe('1500'));
	await fireEvent.input(amount(), { target: { value: '1400' } });
	await fireEvent.click(cancel());

	await waitFor(() => expect(question()).not.toBeNull());
	expect(onOpenChange).not.toHaveBeenCalled();
});
