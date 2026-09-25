import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { placeholderStrings as strings } from '$lib/design/tests/strings';
import en from '$lib/i18n/en';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import type { PaymentActRecord } from '$lib/payment/acts';
import PaymentHost from '$lib/payment/component/host.svelte';
import { paymentHost } from '$lib/payment/host.svelte';
import QueryProviders from '#tests/query-providers.svelte';

/**
 * A RECEIPT, FROM THE ACT TO THE PREVIEW
 *
 * Tickets 11 and 13 of [[efforts/835-the-rent-is-receipted-scheduled-and-chased/spec]], criteria
 * 10(a) and 13(a): the receipt act opens the preview on the language the application shows, the
 * page is headed by the organization rather than the workspace, and a page the host refuses to
 * print is answered with one sentence.
 *
 * **What reaches Rust is stood in for** at `tauri` (the organization's state, the print command),
 * and **the receipt read** at the caller, since what it states is the router's.
 */

const hooks = vi.hoisted(() => ({
	receipt: vi.fn(),
	page: vi.fn(),
	sentences: [] as string[]
}));

vi.mock('$lib/platform/tauri', () => ({
	tauri: {
		organization: {
			getState: async () => ({ session: { organizationName: 'Al Nakheel Estates' } })
		},
		print: { page: hooks.page },
		dialog: { saveFile: vi.fn() }
	}
}));

vi.mock('$lib/api/caller', () => ({
	default: { contract: { payments: { receipt: hooks.receipt } } }
}));

vi.mock('$lib/error/toast', async (original) => ({
	...(await original<Record<string, unknown>>()),
	showErrorSentence: (sentence: string) => hooks.sentences.push(sentence)
}));

vi.mock('$app/state', () => ({ page: { url: new URL('http://localhost/contracts') } }));

const RECEIPT = {
	reference: '01K5-Z3QW-8M2T-4HBC',
	payment: {
		id: 'payment-1',
		contractId: 'contract-1',
		date: Date.UTC(2026, 3, 1),
		amount: 4500,
		method: null,
		reference: null,
		note: null
	},
	tenant: { name: 'Noura', nationalId: '1012345678' },
	contract: { govId: '4471', start: Date.UTC(2026, 0, 1), end: Date.UTC(2026, 11, 31) },
	units: [],
	cycles: [],
	remaining: 7500
};

const PAYMENT: PaymentActRecord = {
	id: 'payment-1',
	contractId: 'contract-1',
	date: Date.UTC(2026, 3, 1),
	amount: 4500,
	contractStatus: 'active'
};

beforeEach(() => {
	window.ResizeObserver ??= class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
	loadLocale('en');
	loadLocale('ar');
	hooks.receipt.mockReset();
	hooks.receipt.mockResolvedValue(RECEIPT);
	hooks.page.mockReset();
	hooks.sentences.length = 0;
});

afterEach(() => {
	setLocale('en');
	document.body.innerHTML = '';
});

const renderHost = () =>
	render(PaymentHost, {}, { wrapper: QueryProviders, wrapperProps: { strings, direction: 'ltr' } });

const page = () => document.querySelector<HTMLElement>('[data-print-preview] [data-receipt]');

test('the receipt opens in the preview, headed by the organization, on the application’s language', async () => {
	setLocale('ar');
	renderHost();

	expect(paymentHost.run('payment.receipt', PAYMENT)).toBe(true);

	await waitFor(() => expect(page()).not.toBeNull());
	expect(page()?.getAttribute('lang')).toBe('ar');
	expect(page()?.querySelector('[data-receipt-issuer]')?.textContent?.trim()).toBe(
		'Al Nakheel Estates'
	);
	expect(hooks.receipt).toHaveBeenCalledWith({ id: 'payment-1' });
});

test('a page the host refuses to print is answered with one sentence', async () => {
	setLocale('en');
	hooks.page.mockRejectedValue(new Error('the printer is gone'));
	renderHost();

	paymentHost.run('payment.receipt', PAYMENT);

	const print = await waitFor(() => {
		const button = document.querySelector<HTMLButtonElement>('[data-print-paper]');

		expect(button).not.toBeNull();

		return button!;
	});

	await fireEvent.submit(print.form!);

	await waitFor(() => expect(hooks.sentences).toEqual([en.print.failed]));
});
