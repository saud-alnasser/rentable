import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { refuse } from '$lib/api/refusal';
import { refusalFields } from '$lib/app/refusal';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import { bindRefusalFields } from '$lib/error/refusal';
import en from '$lib/i18n/en';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import Providers from '#tests/providers.svelte';
import PaymentForm from '$lib/payment/component/form.svelte';

/**
 * THE PAYMENT FORM, OPENED ON A REFUND
 *
 * Ticket 24 of [[efforts/854-bugs-and-edge-cases-across-the-app/spec]], requirements 25 and 26 and
 * criterion 26, the interface half: the refund form states the most that may be refunded before an
 * amount is typed, and why where that is nothing, so the reader is guided to a figure the workspace
 * takes rather than only refused one. It fills no amount, since there is no ordinary refund to
 * confirm, and it writes a refund.
 *
 * **The contract read and the payment's mutations are stood in for**, as the form's other tests
 * do: what the contract is paid is the test's to set (`read`), and what each submit handed the
 * mutations is kept (`submitted`).
 */

const { read, submitted } = vi.hoisted(() => ({
	read: { contract: undefined as unknown, refusal: undefined as unknown },
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
			if (read.refusal) {
				throw read.refusal;
			}

			submitted.push(variables);

			return { id: 'refund-1' };
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

// the fields each refusal belongs under, bound as the composition root binds them.
bindRefusalFields(refusalFields);

// a monthly contract for the year, whose total is 18,000.
const contract = {
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
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(new Date('2026-03-15T09:00:00.000Z'));
});

afterEach(() => {
	vi.useRealTimers();
	document.body.innerHTML = '';
	submitted.length = 0;
	read.refusal = undefined;
});

/** open the form on a new refund, or on the refund given. */
const open = (value?: Record<string, unknown>) =>
	render(
		PaymentForm,
		{
			contractId: 'contract-1',
			direction: 'refund',
			value: value as never,
			open: true,
			onOpenChange: () => {}
		},
		{ wrapper: Providers, wrapperProps: { strings, direction: 'ltr' } }
	);

const limit = () => document.querySelector('[data-refund-limit]')?.textContent ?? '';
const why = () => document.querySelector('[data-refund-why]')?.textContent?.trim();
const amount = () => document.querySelector<HTMLInputElement>('input[inputmode=decimal]');

test('on a live contract paid 1,000 beyond its total, the form says 1,000 may be refunded', async () => {
	read.contract = { ...contract, paidAmount: 19000 };

	open();

	await waitFor(() => expect(limit()).toMatch(/1,000/));
	expect(document.body.textContent).toContain(en.contracts.payments.refund.limitHint);
	expect(why()).toBeUndefined();
});

test('on a live contract paid exactly its total, the form says nothing may be refunded, and why', async () => {
	read.contract = { ...contract, status: 'fulfilled', paidAmount: 18000 };

	open();

	await waitFor(() => expect(limit()).toMatch(/\b0\b/));
	expect(why()).toBe(en.contracts.payments.refund.unavailable.nothingToRefund);
});

test('on a terminated contract that received 5,000, the form says 5,000 may be refunded', async () => {
	read.contract = { ...contract, status: 'terminated', paidAmount: 5000 };

	open();

	await waitFor(() => expect(limit()).toMatch(/5,000/));
	expect(why()).toBeUndefined();
});

test('a refund is titled as one, fills no amount, and is written as a refund', async () => {
	read.contract = { ...contract, paidAmount: 19000 };

	open();

	await waitFor(() => expect(limit()).toMatch(/1,000/));

	const title = document.querySelector('[data-slot=form-surface] h2, [data-slot$=title]');

	expect(title?.textContent?.trim().toLowerCase()).toBe(en.contracts.payments.refund.title);
	// the payment form's default is the rent due; a refund has no ordinary figure to confirm.
	expect(amount()?.value).toBe('');

	await fireEvent.input(amount()!, { target: { value: '600' } });
	await fireEvent.submit(document.querySelector<HTMLFormElement>('[data-slot=form-surface] form')!);

	await waitFor(() => expect(submitted).toHaveLength(1));
	expect(submitted[0]).toMatchObject({
		contractId: 'contract-1',
		amount: 600,
		direction: 'refund'
	});
});

test('a refund being edited is not weighed against itself', async () => {
	// 19,400 received, 400 of it returned by the refund being edited: 1,000 beyond the total now,
	// and 1,400 once this refund's own amount is set aside.
	read.contract = { ...contract, paidAmount: 19000 };

	open({
		id: 'refund-1',
		contractId: 'contract-1',
		date: Date.UTC(2026, 2, 1),
		amount: 400,
		direction: 'refund',
		method: null,
		reference: null,
		note: null
	});

	await waitFor(() => expect(limit()).toMatch(/1,400/));
	expect(amount()?.value).toBe('400');
});

test('a refund above the limit is refused under the amount, naming the limit', async () => {
	// the workspace moved since the form read the contract: the procedure is the authority.
	read.contract = { ...contract, paidAmount: 19000 };
	read.refusal = refuse('contract.refundAboveLimit', { limit: 1000 });
	Element.prototype.scrollIntoView ??= () => {};

	open();

	await waitFor(() => expect(limit()).toMatch(/1,000/));
	await fireEvent.input(amount()!, { target: { value: '1001' } });
	await fireEvent.submit(document.querySelector<HTMLFormElement>('[data-slot=form-surface] form')!);

	await waitFor(() =>
		expect(amount()?.closest('[data-slot=form-item], .group')?.textContent).toContain(
			'a refund on this contract cannot exceed 1,000.'
		)
	);
});

// the human, 2026-10-07 (effort 854, requirement 25 as amended): the bar's plus opens the payment
// form, and a payment and a refund are its two tabs. A tab the contract does not take says why, and
// nothing is created from it; the other is a press away.
const openNew = (direction: 'received' | 'refund') =>
	render(
		PaymentForm,
		{ contractId: 'contract-1', direction, open: true, onOpenChange: () => {} },
		{ wrapper: Providers, wrapperProps: { strings, direction: 'ltr' } }
	);

const tab = (direction: 'received' | 'refund') =>
	document.querySelector<HTMLElement>(`[data-payment-direction] [data-direction="${direction}"]`);
const submit = () =>
	document.querySelector<HTMLButtonElement>('[data-slot=form-surface] button[type=submit]');

test('a tab the contract does not take is dimmed with its reason, and the form opens on the other', async () => {
	// paid beyond its total: no new payment, and 1,000 to refund.
	read.contract = { ...contract, paidAmount: 19000 };

	// asked for a payment, as the plus asks before the contract is weighed here.
	openNew('received');

	await waitFor(() => expect(tab('refund')?.getAttribute('data-state')).toBe('on'));
	expect(tab('received')?.textContent).toContain(en.common.labels.payment);
	expect(tab('refund')?.textContent?.trim()).toBe(en.contracts.payments.refund.tag);
	// each its glyph, money in and money out.
	expect(tab('received')?.querySelector('svg')?.getAttribute('class')).toMatch(
		/banknote-arrow-down/
	);
	expect(tab('refund')?.querySelector('svg')?.getAttribute('class')).toMatch(/banknote-arrow-up/);

	// the payment tab: dimmed, reachable, saying why, and choosing nothing.
	const refused = tab('received')!;

	expect(refused.getAttribute('aria-disabled')).toBe('true');
	expect(document.getElementById(refused.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
		en.contracts.payments.fullyPaidNotice
	);
	await fireEvent.click(refused);
	expect(tab('refund')?.getAttribute('data-state')).toBe('on');
	expect(tab('received')?.getAttribute('data-state')).toBe('off');

	// the tab chosen takes a refund, so nothing about creating it is dimmed.
	await waitFor(() => expect(limit()).toMatch(/1,000/));
	expect(submit()?.disabled).toBe(false);

	await fireEvent.input(amount()!, { target: { value: '600' } });
	await fireEvent.submit(document.querySelector<HTMLFormElement>('[data-slot=form-surface] form')!);

	await waitFor(() => expect(submitted).toHaveLength(1));
	expect(submitted[0]).toMatchObject({
		contractId: 'contract-1',
		amount: 600,
		direction: 'refund'
	});
});
test('a contract still owing opens on the payment, filled with what is due, its refund tab dimmed', async () => {
	read.contract = { ...contract, paidAmount: 3000 };

	openNew('received');

	await waitFor(() => expect(amount()?.value).toBe('1500'));
	expect(tab('received')?.getAttribute('data-state')).toBe('on');

	const refused = tab('refund')!;

	expect(refused.getAttribute('aria-disabled')).toBe('true');
	expect(document.getElementById(refused.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
		en.contracts.payments.refund.unavailable.nothingToRefund
	);

	await fireEvent.click(refused);
	expect(tab('received')?.getAttribute('data-state')).toBe('on');
	expect(amount()?.value).toBe('1500');
	expect(submit()?.disabled).toBe(false);
});
test('an edit draws no tabs: it goes the way its payment went', async () => {
	read.contract = { ...contract, paidAmount: 19000 };

	open({
		id: 'refund-1',
		contractId: 'contract-1',
		date: Date.UTC(2026, 2, 10),
		amount: 400,
		direction: 'refund'
	});

	await waitFor(() => expect(limit()).not.toBe(''));
	expect(document.querySelector('[data-payment-direction]')).toBeNull();
});

// the human, 2026-10-07: the dimmed tab's reason stood open as the form opened, unhovered. The
// focus the surface places as it opens lands on the tab chosen, and no reason opens until the
// reader hovers the dimmed tab or moves to it.
test('opening the form opens no reason; hovering or moving to the dimmed tab does', async () => {
	read.contract = { ...contract, status: 'terminated', paidAmount: 5000 };
	// the one browser fact a tooltip's content reaches for that jsdom does not carry.
	window.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;

	openNew('refund');

	await waitFor(() => expect(tab('refund')?.getAttribute('data-state')).toBe('on'));
	await new Promise((resolve) => setTimeout(resolve, 50));

	expect(document.querySelector('[data-unavailable-reason]')).toBeNull();

	// hovered, the dimmed tab says why; left, it closes again.
	await fireEvent.pointerEnter(tab('received')!);
	await waitFor(() =>
		expect(document.querySelector('[data-unavailable-reason]')?.textContent).toBe(
			en.contracts.payments.terminatedNotice
		)
	);
	await fireEvent.pointerLeave(tab('received')!);
	await waitFor(() => expect(document.querySelector('[data-unavailable-reason]')).toBeNull());

	// moved to by the keyboard, it says why too.
	await fireEvent.keyDown(tab('refund')!, { key: 'ArrowLeft' });
	await fireEvent.focus(tab('received')!);
	await waitFor(() =>
		expect(document.querySelector('[data-unavailable-reason]')?.textContent).toBe(
			en.contracts.payments.terminatedNotice
		)
	);
});
