import { beforeEach, expect, test } from 'vitest';

import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import type { PaymentActRecord } from '$lib/payment/acts';
import { closePaymentForm, paymentHost, paymentHostState } from '$lib/payment/host.svelte';

/**
 * A HOST ASKED BY ID REFUSES WHAT EVERY SURFACE SHOWS REFUSED
 *
 * Ticket 36 of [[efforts/832-the-interface-speaks-one-language-and-guides/spec]], from converge
 * round 1. The command menu checked an act's `unavailable` before running it, and each concept
 * host's `run` checked only `appliesTo`, so a caller asking the host directly could open the form
 * on a payment whose contract is terminated, which the payment's page shows refused. The payment
 * host stands for all of them: each one's `run` reads the same `mayRun` in `design/acts.ts`.
 */

const payment: PaymentActRecord = {
	id: 'payment-1',
	date: Date.UTC(2026, 2, 1),
	amount: 2377,
	contractId: 'contract-1',
	contractStatus: 'terminated'
};

beforeEach(() => {
	loadLocale('en');
	setLocale('en');
	closePaymentForm();
});

test('an act refused for a reason is not run, and the host says so', () => {
	expect(paymentHost.run('payment.edit', payment)).toBe(false);
	expect(paymentHostState.form.open).toBe(false);
});

test('the same act on a contract still running is run', () => {
	expect(paymentHost.run('payment.edit', { ...payment, contractStatus: 'active' })).toBe(true);
	expect(paymentHostState.form.open).toBe(true);
});
