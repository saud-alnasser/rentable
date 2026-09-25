import { render } from '@testing-library/svelte';
import { afterEach, beforeAll, expect, test } from 'vitest';

import ar from '$lib/i18n/ar';
import en from '$lib/i18n/en';
import type { Locales } from '$lib/i18n/i18n-types';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import { formatRecordDate, formatRecordDateRange } from '$lib/design/date';
import { formatLocaleMoney } from '$lib/platform/locale';
import PrintedReceipt, { type PrintedReceiptValue } from '$lib/payment/component/receipt.svelte';

/**
 * A PAYMENT'S RECEIPT, ON PAPER
 *
 * Tickets 06 and 11 of [[efforts/835-the-rent-is-receipted-scheduled-and-chased/spec]],
 * requirements 9 and 10 as revised on 2026-09-25: the page carries every fact requirement 9 lists,
 * in the one language the reader chose (criterion 9(c)); a method or a reference not recorded is
 * left out with its label; the issuer is the workspace and heads the page. The printed page itself
 * is checked by hand (criterion 10).
 */

const day = (value: string) => Date.parse(`${value}T00:00:00.000Z`);

const VALUE: PrintedReceiptValue = {
	reference: '01K5-Z3QW-8M2T-4HBC',
	issuer: 'Al Nakheel Properties',
	mark: null,
	payment: {
		id: '01990002-0000-7000-8000-000000000000',
		contractId: 'contract-1',
		date: day('2026-04-01'),
		amount: 4500,
		method: 'bank-transfer',
		reference: 'SADAD-7731',
		note: 'paid at the office'
	},
	tenant: { name: 'Noura Al-Qahtani', nationalId: '1012345678' },
	contract: { govId: '20471133', start: day('2026-01-01'), end: day('2026-12-31') },
	units: [
		{ name: 'A-12', complexName: 'Al Nakheel' },
		{ name: 'A-13', complexName: 'Al Nakheel' }
	],
	cycles: [
		{ index: 1, due: day('2026-04-01') },
		{ index: 2, due: day('2026-07-01') }
	],
	remaining: 4500
};

beforeAll(() => {
	loadLocale('en');
	loadLocale('ar');
});

afterEach(() => {
	document.body.innerHTML = '';
});

const printed = (locale: Locales, value: PrintedReceiptValue = VALUE) =>
	render(PrintedReceipt, { value, locale });
const page = () => document.querySelector<HTMLElement>('[data-receipt]')!;
const text = (element: Element | null) => element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
/** money is compared as written, since its spacing is not a plain space. */
const written = (name: string) => page().querySelector(`[${name}]`)?.textContent?.trim();

test('a receipt chosen in Arabic reads right to left and carries no English label', () => {
	printed('ar');

	expect(page().getAttribute('lang')).toBe('ar');
	expect(page().getAttribute('dir')).toBe('rtl');
	expect(text(page().querySelector('h1'))).toBe(ar.contracts.payments.receipt.title);

	for (const label of [
		en.contracts.payments.receipt.amount,
		en.contracts.payments.receipt.receivedFrom,
		en.common.labels.units,
		en.contracts.payments.receipt.remaining
	]) {
		expect(text(page()).toLowerCase()).not.toContain(label);
	}
});

test('a receipt chosen in English reads left to right and carries no Arabic', () => {
	printed('en');

	expect(page().getAttribute('lang')).toBe('en');
	expect(page().getAttribute('dir')).toBe('ltr');
	expect(text(page())).not.toMatch(/[؀-ۿ]/);
});

test('the page carries every fact of requirement 9, headed by the workspace that issued it', () => {
	for (const locale of ['ar', 'en'] as const) {
		printed(locale);

		const said = text(page());

		expect(text(page().querySelector('header [data-receipt-issuer]'))).toBe(VALUE.issuer);

		for (const fact of [
			VALUE.reference,
			formatRecordDate(locale, VALUE.payment.date),
			VALUE.tenant.name,
			VALUE.tenant.nationalId,
			(locale === 'ar' ? ar : en).contracts.payments.methods.bankTransfer,
			'SADAD-7731',
			'20471133',
			'A-12',
			'A-13',
			'Al Nakheel',
			formatRecordDateRange(locale, VALUE.contract.start, VALUE.contract.end)
		]) {
			expect(said, `${locale} states ${fact}`).toContain(fact);
		}

		expect(written('data-receipt-amount')).toBe(formatLocaleMoney(locale, VALUE.payment.amount));
		expect(written('data-receipt-remaining')).toBe(formatLocaleMoney(locale, 4500));

		document.body.innerHTML = '';
	}
});

test('a payment covering the second cycle and part of the third names both', () => {
	printed('en');

	expect([...page().querySelectorAll('[data-receipt-cycle]')].map(text)).toEqual([
		`cycle 2, due ${formatRecordDate('en', day('2026-04-01'))}`,
		`cycle 3, due ${formatRecordDate('en', day('2026-07-01'))}`
	]);
});

test('a method and a reference not recorded are left out, their labels with them', () => {
	printed('en', { ...VALUE, payment: { ...VALUE.payment, method: null, reference: null } });

	expect(page().querySelector('[data-receipt-label="method"]')).toBeNull();
	expect(page().querySelector('[data-receipt-label="reference"]')).toBeNull();
	expect(text(page())).not.toContain(en.contracts.payments.method);
});

test('the note is the landlord’s and is not printed, and nothing reads as a tax invoice', () => {
	for (const locale of ['ar', 'en'] as const) {
		printed(locale);

		expect(text(page())).not.toContain('paid at the office');
		expect(text(page()).toLowerCase()).not.toMatch(/invoice|vat|فاتورة|ضريبة/);

		document.body.innerHTML = '';
	}
});

// effort 835, requirement 13(e): the organization's signature or seal at the foot, where set.
test('a receipt prints the organization’s mark at its foot, and an empty foot where there is none', () => {
	printed('en', { ...VALUE, mark: { mediaType: 'image/png', data: 'iVBORw0K' } });

	const image = page().querySelector<HTMLImageElement>('[data-printed-mark] img');

	expect(image?.getAttribute('src')).toBe('data:image/png;base64,iVBORw0K');
	expect(image?.getAttribute('alt')).toBe(en.organization.mark.alt);

	document.body.innerHTML = '';
	printed('en');

	expect(page().querySelector('[data-printed-mark]')).toBeNull();
});
