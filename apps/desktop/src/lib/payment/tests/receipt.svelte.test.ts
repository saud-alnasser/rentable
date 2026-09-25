import { render } from '@testing-library/svelte';
import { afterEach, beforeAll, expect, test } from 'vitest';

import ar from '$lib/i18n/ar';
import en from '$lib/i18n/en';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import { formatRecordDate, formatRecordDateRange } from '$lib/design/date';
import { formatLocaleMoney } from '$lib/platform/locale';
import PrintedReceipt, { type PrintedReceiptValue } from '$lib/payment/component/receipt.svelte';

/**
 * A PAYMENT'S RECEIPT, ON PAPER
 *
 * Ticket 06 of [[efforts/835-the-rent-is-receipted-scheduled-and-chased/spec]], requirement 9 and
 * criteria 9(a), 9(c) and 9(d): the page carries every fact the requirement lists, once in Arabic
 * reading right to left and once in English reading left to right; a method or a reference not
 * recorded is left out with its label; the issuer is the workspace. The printed page itself,
 * through the dialog, is checked by hand (criterion 10).
 */

const day = (value: string) => Date.parse(`${value}T00:00:00.000Z`);

const VALUE: PrintedReceiptValue = {
	reference: '01K5-Z3QW-8M2T-4HBC',
	issuer: 'Al Nakheel Properties',
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

const block = (locale: 'ar' | 'en') =>
	document.querySelector<HTMLElement>(`[data-receipt-block="${locale}"]`)!;
const text = (element: Element | null) => element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

test('the receipt is stated in Arabic right to left and in English left to right on one page', () => {
	render(PrintedReceipt, { value: VALUE });

	expect(block('ar').getAttribute('lang')).toBe('ar');
	expect(block('ar').getAttribute('dir')).toBe('rtl');
	expect(block('en').getAttribute('lang')).toBe('en');
	expect(block('en').getAttribute('dir')).toBe('ltr');

	expect(text(block('ar').querySelector('h1'))).toBe(ar.contracts.payments.receipt.title);
	expect(text(block('en').querySelector('h1'))).toBe(en.contracts.payments.receipt.title);
});

test('each block carries every fact of requirement 9, the issuer being the workspace', () => {
	render(PrintedReceipt, { value: VALUE });

	for (const locale of ['ar', 'en'] as const) {
		const said = text(block(locale));

		for (const fact of [
			VALUE.reference,
			VALUE.issuer,
			formatRecordDate(locale, VALUE.payment.date),
			VALUE.tenant.name,
			VALUE.tenant.nationalId,
			locale === 'ar'
				? ar.contracts.payments.methods.bankTransfer
				: en.contracts.payments.methods.bankTransfer,
			'SADAD-7731',
			'20471133',
			'A-12',
			'A-13',
			'Al Nakheel',
			formatRecordDateRange(locale, VALUE.contract.start, VALUE.contract.end)
		]) {
			expect(said, `${locale} states ${fact}`).toContain(fact);
		}

		// money is compared as written, since its spacing is not a plain space.
		const money = (name: string) => block(locale).querySelector(`[${name}]`)?.textContent?.trim();

		expect(money('data-receipt-amount')).toBe(formatLocaleMoney(locale, VALUE.payment.amount));
		expect(money('data-receipt-remaining')).toBe(formatLocaleMoney(locale, 4500));
		expect(text(block(locale).querySelector('[data-receipt-issuer]'))).toBe(VALUE.issuer);
	}
});

test('a payment covering the second cycle and part of the third names both', () => {
	render(PrintedReceipt, { value: VALUE });

	const english = [...block('en').querySelectorAll('[data-receipt-cycle]')].map(text);

	expect(english).toEqual([
		`cycle 2, due ${formatRecordDate('en', day('2026-04-01'))}`,
		`cycle 3, due ${formatRecordDate('en', day('2026-07-01'))}`
	]);
	expect(block('ar').querySelectorAll('[data-receipt-cycle]')).toHaveLength(2);
});

test('a method and a reference not recorded are left out, their labels with them', () => {
	render(PrintedReceipt, {
		value: { ...VALUE, payment: { ...VALUE.payment, method: null, reference: null } }
	});

	for (const locale of ['ar', 'en'] as const) {
		expect(block(locale).querySelector('[data-receipt-method]')).toBeNull();
		expect(block(locale).querySelector('[data-receipt-payment-reference]')).toBeNull();
		expect(text(block(locale))).not.toContain(
			locale === 'ar' ? ar.contracts.payments.method : en.contracts.payments.method
		);
	}
});

test('the note is the landlord’s and is not printed, and nothing reads as a tax invoice', () => {
	render(PrintedReceipt, { value: VALUE });

	const page = text(document.querySelector('[data-receipt]'));

	expect(page).not.toContain('paid at the office');
	expect(page.toLowerCase()).not.toMatch(/invoice|vat|فاتورة|ضريبة/);
});
