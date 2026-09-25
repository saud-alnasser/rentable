import { render } from '@testing-library/svelte';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import Providers from '$lib/design/cell/tests/providers.svelte';
import en from '$lib/i18n/en';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import Breadcrumb from '$lib/layout/component/breadcrumb.svelte';
import PaymentDetails from '$lib/payment/component/details.svelte';

/**
 * A PAYMENT'S PAGE READS AS ITS SIBLINGS DO
 *
 * Ticket 33 of [[efforts/832-the-interface-speaks-one-language-and-guides/spec]], from the second
 * walk of ticket 27. The payment's page said "payment" above its amount where every other record
 * says its directory's name, its trail read "contracts › 2,377" and skipped the contract the payment
 * belongs to, a lock stood beside the contract number with nothing saying what it was, and on a
 * terminated contract the page offered copy alone, its other acts missing rather than refused
 * (requirements 14 and 16; [[rules/interface]], *Navigation* and *Guidance*).
 *
 * **The read and the address are mocked.** The payment is one on a terminated contract, which is
 * the case every act but copying is refused on; the breadcrumb is drawn under the payment's route
 * id, since `$app/state` carries no navigation under this runner.
 */

const { payment } = vi.hoisted(() => ({
	payment: {
		id: 'payment-1',
		date: Date.UTC(2026, 2, 1),
		amount: 2377,
		contractId: 'contract-1',
		contractGovId: '1001',
		contractStatus: 'terminated' as 'terminated' | 'active',
		tenantName: 'Noura Alharbi'
	}
}));

vi.mock('$lib/payment/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/payment/query')>()),
	useFetchPayment: () => ({ data: payment, isLoading: false })
}));

vi.mock('$app/state', () => ({
	page: { route: { id: '/contracts/payments/[id]' }, url: new URL('http://localhost/') }
}));

beforeEach(() => {
	loadLocale('en');
	setLocale('en');
	payment.contractStatus = 'terminated';
});

afterEach(() => {
	document.body.innerHTML = '';
});

const page = () => render(PaymentDetails, { paymentId: payment.id }, { wrapper: Providers });

/** what an element's `aria-describedby` names, as assistive technology hears it. */
const describedBy = (element: Element | null) =>
	document.getElementById(element?.getAttribute('aria-describedby') ?? '')?.textContent?.trim();

test("the eyebrow is the payments' own name, as a contract's is the contracts'", () => {
	page();

	const header = document.querySelector('header');

	expect(header?.textContent).toContain(en.common.nav.payments);
	expect(header?.querySelector('p')?.textContent?.trim()).toBe(en.common.nav.payments);
});

test('the trail runs through the contract the payment belongs to, and links to it', () => {
	page();
	render(Breadcrumb, {}, { wrapper: Providers });

	const trail = [...document.querySelectorAll('[data-slot="breadcrumb-item"]')].map((crumb) =>
		crumb.textContent?.trim()
	);

	// the directory, the contract by the name its own page ends its trail on, then the amount.
	expect(trail).toHaveLength(3);
	expect(trail.slice(0, 2)).toEqual([en.common.nav.contracts, payment.tenantName]);
	expect(trail[2]).toContain('2,377');

	const contract = document.querySelector<HTMLAnchorElement>('[data-crumb-parent]');

	expect(contract?.getAttribute('href')).toMatch(/\/contracts\/contract-1$/);
});

test("the contract's status is a field of its own, under its own label", () => {
	page();

	const status = [...document.querySelectorAll('.sr-only')].find(
		(node) => node.textContent === en.common.status.terminated
	);

	expect(status, 'the status is named').toBeTruthy();

	// the entry it stands in is labelled for what it is, and the contract number stands alone.
	const entry = status!.closest('dd')?.previousElementSibling;

	expect(entry?.textContent?.toLowerCase()).toBe(en.common.labels.contractStatus);

	const number = [...document.querySelectorAll('dd')].find((value) =>
		value.textContent?.includes(payment.contractGovId)
	);

	expect(number?.querySelector('svg'), 'no glyph beside the contract number').toBeNull();
});

test('on a terminated contract the acts that write are shown refused, with the reason', () => {
	page();

	const refused = [...document.querySelectorAll<HTMLElement>('[data-unavailable]')];
	const names = refused.map((control) => control.textContent?.trim() ?? '');

	for (const act of [
		en.common.actions.duplicate,
		en.common.actions.edit,
		en.common.actions.delete
	]) {
		expect(
			names.some((name) => name.startsWith(act)),
			`${act} is offered, refused`
		).toBe(true);
	}

	for (const control of refused) {
		expect(control.getAttribute('aria-disabled')).toBe('true');
		expect(describedBy(control)).toBe(en.contracts.payments.terminatedNotice);
	}
});

test('on a contract still running, the same acts are offered and nothing is refused', () => {
	payment.contractStatus = 'active';

	page();

	expect(document.querySelectorAll('[data-unavailable]')).toHaveLength(0);
});
