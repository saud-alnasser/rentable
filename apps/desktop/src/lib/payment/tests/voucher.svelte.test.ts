import { render } from '@testing-library/svelte';
import { afterEach, beforeAll, expect, test } from 'vitest';

import ar from '$lib/i18n/ar';
import en from '$lib/i18n/en';
import type { Locales } from '$lib/i18n/i18n-types';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import { formatRecordDate, formatRecordDateRange } from '$lib/date';
import { formatLocaleMoney } from '$lib/platform/locale';
import PrintedVoucher, { type PrintedVoucherValue } from '$lib/payment/component/voucher.svelte';

/**
 * A REFUND'S VOUCHER, ON PAPER
 *
 * Ticket 25 of [[efforts/854-bugs-and-edge-cases-across-the-app/spec]], requirement 29 and
 * criterion 29: a refund prints a payment voucher (سند صرف) in Arabic or in English, carrying its
 * number, the tenant it was paid to, the contract, the amount, the date, the method and reference
 * where recorded, the note as the reason, and a line for the tenant's signature. It is not a tax
 * document. The printed page itself is checked by hand.
 */

const day = (value: string) => Date.parse(`${value}T00:00:00.000Z`);

const TENANT = { name: 'Noura Al-Qahtani', nationalId: '1012345678' };
const CONTRACT = { govId: '20471133', start: day('2026-01-01'), end: day('2026-12-31') };

const VALUE: PrintedVoucherValue = {
	kind: 'voucher',
	reference: '01K5-Z3QW-8M2T-4HBC',
	issuer: 'Al Nakheel Properties',
	mark: null,
	payment: {
		id: '01990002-0000-7000-8000-000000000000',
		contractId: 'contract-1',
		date: day('2026-09-15'),
		amount: 1500,
		direction: 'refund',
		method: 'bank-transfer',
		reference: 'TRF-2201',
		note: 'deposit returned on leaving'
	},
	tenant: TENANT,
	contract: CONTRACT,
	units: [{ name: 'A-12', complexName: 'Al Nakheel' }],
	cycles: []
};

beforeAll(() => {
	loadLocale('en');
	loadLocale('ar');
});

afterEach(() => {
	document.body.innerHTML = '';
});

const printed = (locale: Locales, value: PrintedVoucherValue = VALUE) =>
	render(PrintedVoucher, { value, locale });
const page = () => document.querySelector<HTMLElement>('[data-voucher]')!;
const text = (element: Element | null) => element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
/** money is compared as written, since its spacing is not a plain space. */
const written = (name: string) => page().querySelector(`[${name}]`)?.textContent?.trim();

test('a voucher chosen in Arabic reads right to left, as a سند صرف, with no English label', () => {
	printed('ar');

	expect(page().getAttribute('lang')).toBe('ar');
	expect(page().getAttribute('dir')).toBe('rtl');
	expect(text(page().querySelector('h1'))).toBe('سند صرف');
	expect(text(page().querySelector('h1'))).toBe(ar.contracts.payments.voucher.title);

	for (const label of [
		en.contracts.payments.voucher.amount,
		en.contracts.payments.voucher.paidTo,
		en.contracts.payments.voucher.reason,
		en.contracts.payments.voucher.signature
	]) {
		expect(text(page()).toLowerCase()).not.toContain(label);
	}
});

test('a voucher chosen in English reads left to right, as a payment voucher, with no Arabic', () => {
	printed('en');

	expect(page().getAttribute('lang')).toBe('en');
	expect(page().getAttribute('dir')).toBe('ltr');
	expect(text(page().querySelector('h1')).toLowerCase()).toBe('payment voucher');
	expect(text(page())).not.toMatch(/[؀-ۿ]/);
});

test('the voucher carries every field of requirement 29 in both languages', () => {
	for (const locale of ['ar', 'en'] as const) {
		printed(locale);

		const t = locale === 'ar' ? ar : en;
		const said = text(page());

		expect(text(page().querySelector('header [data-voucher-issuer]'))).toBe(VALUE.issuer);
		expect(text(page().querySelector('[data-voucher-number]'))).toBe(VALUE.reference);
		expect(text(page().querySelector('[data-voucher-date]'))).toBe(
			formatRecordDate(locale, VALUE.payment.date)
		);
		expect(written('data-voucher-amount')).toBe(formatLocaleMoney(locale, 1500));

		// the money went to the tenant, and the page says so in the voucher's own words.
		expect(said).toContain(t.contracts.payments.voucher.paidTo);
		expect(said).toContain(t.contracts.payments.voucher.amount);
		expect(said).not.toContain(t.contracts.payments.receipt.receivedFrom);

		for (const fact of [
			TENANT.name,
			TENANT.nationalId,
			t.contracts.payments.methods.bankTransfer,
			'TRF-2201',
			'20471133',
			formatRecordDateRange(locale, CONTRACT.start, CONTRACT.end),
			'A-12'
		]) {
			expect(said, `${locale} states ${fact}`).toContain(fact);
		}

		// the note is the reason the money went back.
		expect(text(page().querySelector('[data-voucher-label="reason"]'))).toBe(
			t.contracts.payments.voucher.reason
		);
		expect(text(page().querySelector('[data-voucher-reason]'))).toBe('deposit returned on leaving');

		// it ends with a line for the tenant to sign.
		expect(text(page().querySelector('[data-voucher-signature]'))).toBe(
			t.contracts.payments.voucher.signature
		);

		// a voucher covers no cycle and states nothing remaining, and is not a tax document.
		expect(page().querySelector('[data-receipt-cycles], [data-receipt-remaining]')).toBeNull();
		expect(said.toLowerCase()).not.toMatch(/invoice|vat|فاتورة|ضريبة/);

		document.body.innerHTML = '';
	}
});

test('a method, a reference and a reason not recorded are left out, their labels with them', () => {
	printed('en', {
		...VALUE,
		payment: { ...VALUE.payment, method: null, reference: null, note: null }
	});

	for (const name of ['method', 'reference', 'reason']) {
		expect(page().querySelector(`[data-voucher-label="${name}"]`), name).toBeNull();
	}

	// the line to sign stays, whatever was recorded.
	expect(page().querySelector('[data-voucher-signature]')).not.toBeNull();
});

test('a voucher answered without the tenant, the contract or the units prints none of them', () => {
	const { kind, reference, issuer, mark, payment, cycles } = VALUE;

	printed('en', { kind, reference, issuer, mark, payment, cycles });

	for (const name of ['tenant', 'nationalId', 'contractNumber', 'period', 'units']) {
		expect(page().querySelector(`[data-voucher-label="${name}"]`), name).toBeNull();
	}

	expect(text(page())).not.toContain(TENANT.name);
	expect(written('data-voucher-amount')).toBe(formatLocaleMoney('en', 1500));
});

test('a voucher prints the organization’s mark at its foot where one is set', () => {
	printed('en', { ...VALUE, mark: { mediaType: 'image/png', data: 'iVBORw0K' } });

	expect(
		page().querySelector<HTMLImageElement>('[data-printed-mark] img')?.getAttribute('src')
	).toBe('data:image/png;base64,iVBORw0K');
});
