import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';

import { refuse } from '$lib/api/refusal';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import en from '$lib/i18n/en';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import QueryProviders from '$lib/organization/tests/query-providers.svelte';
import PaymentForm from '$lib/payment/component/form.svelte';

/**
 * THE PAYMENT FORM, REFUSED
 *
 * Ticket 38 of effort 832: no form swallows a refusal. The payment's mutations turn the generic
 * error toast off, because the form places what it can beside its field; a refusal it has no field
 * for is still said, through the shared handler, in the reader's words.
 *
 * **The contract read and the payment's mutations are stood in for**, as the form's other test
 * does, and what the create answers is the test's to set (`answer`). The toast is stood in for too,
 * and what it was asked to raise is what is asserted.
 */

const { answer, raised } = vi.hoisted(() => ({
	answer: { create: undefined as unknown },
	raised: [] as string[]
}));

vi.mock('svelte-sonner', () => ({
	toast: {
		success: () => {},
		error: (message: string) => raised.push(message),
		warning: () => {},
		dismiss: () => {}
	}
}));

vi.mock('$lib/contract/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/contract/query')>()),
	useFetchContract: () => ({
		isPending: false,
		data: {
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
		}
	})
}));

vi.mock('$lib/payment/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/payment/query')>()),
	useCreatePayment: () => ({
		isPending: false,
		mutateAsync: async () => {
			throw answer.create;
		}
	}),
	useUpdatePayment: () => ({ isPending: false, mutateAsync: async () => undefined })
}));

loadLocale('en');
setLocale('en');

// jsdom lays nothing out and has no `scrollIntoView`, which a refused submit calls to bring the
// field into view. A no-op stands in; where the field lands is not what is asserted.
beforeAll(() => {
	Element.prototype.scrollIntoView ??= () => {};
});

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(new Date('2026-03-15T09:00:00.000Z'));
	raised.length = 0;
});

afterEach(() => {
	vi.useRealTimers();
	document.body.innerHTML = '';
});

/** open a new payment, wait for its amount to be filled, and submit it. */
async function submit() {
	render(
		PaymentForm,
		{ contractId: 'contract-1', open: true, onOpenChange: () => {} },
		{ wrapper: QueryProviders, wrapperProps: { strings, direction: 'ltr' } }
	);

	const amount = () => document.querySelector<HTMLInputElement>('input[inputmode=decimal]');

	await waitFor(() => expect(amount()?.value).toBe('500'));
	await fireEvent.submit(document.querySelector<HTMLFormElement>('[data-slot=form-surface] form')!);
}

test('a refusal the form has no field for is said, in the reader’s words', async () => {
	answer.create = refuse('contract.paidInFull');

	await submit();

	await waitFor(() => expect(raised).toEqual([en.common.refusals.contract.paidInFull]));
});

test('a refusal the form has a field for is placed there, and not raised as well', async () => {
	answer.create = refuse('payment.amountNotPositive');

	await submit();

	await waitFor(() =>
		expect(document.body.textContent).toContain(en.common.refusals.payment.amountNotPositive)
	);
	expect(raised).toEqual([]);
});
