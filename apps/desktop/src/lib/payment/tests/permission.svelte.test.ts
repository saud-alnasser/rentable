import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';

import { placeholderStrings as strings } from '$lib/design/tests/strings';
import en from '$lib/i18n/en';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import PaymentDetails from '$lib/payment/component/details.svelte';
import Ledger from '$lib/payment/component/ledger.svelte';
import QueryProviders from '#tests/query-providers.svelte';
import {
	describedBy,
	forgetReader,
	holdEveryFlagBut,
	holdReadOnly,
	layOutLists,
	openPalette,
	paletteRow,
	refusedControl
} from '#tests/permission.ts';

/**
 * A PAYMENT'S ACTS, FOR A READER WHO MAY NOT TAKE THEM ALL
 *
 * Effort 838, requirement 10 and criterion 10: a payment act whose flag the reader lacks is shown
 * refused on the payment's page, naming the flag, and the command menu does not offer it; a
 * contract's ledger refuses its create, its import and deleting a selection the same way; a reader
 * who may not view payments is offered none of their acts, the receipt among them; and on a
 * read-only grant every create, edit and delete reads as refused for the grant.
 *
 * **The reads are the mock**: the payment, the contract it was made against, and the ledger's rows.
 */

const { payment } = vi.hoisted(() => ({
	payment: {
		id: 'payment-1',
		date: Date.UTC(2026, 2, 1),
		amount: 1500,
		contractId: 'contract-1',
		contractGovId: '1001',
		contractStatus: 'active' as const,
		tenantName: 'Noura Alharbi',
		method: null,
		reference: null,
		note: null
	}
}));

vi.mock('$lib/payment/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/payment/query')>()),
	useFetchPayment: () => ({ data: payment, isLoading: false }),
	useListContractPayments: () => ({
		data: [
			{ id: payment.id, date: payment.date, amount: payment.amount, contractId: 'contract-1' }
		],
		isLoading: false,
		isFetching: false
	}),
	useDeleteManyPayments: () => ({ mutateAsync: async () => ({ deleted: [] }) }),
	usePlanManyPayments: () => ({ data: undefined })
}));

vi.mock('$lib/contract/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/contract/query')>()),
	useFetchContract: () => ({
		isLoading: false,
		data: {
			id: 'contract-1',
			status: 'active',
			govId: '1001',
			tenantName: 'Noura',
			paidAmount: 1500,
			expectedAmount: 12000
		}
	})
}));

vi.mock('$lib/history/query', () => ({
	useListHistory: () => ({ data: [], isLoading: false, isFetching: false })
}));

vi.mock('$lib/workspace/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/workspace/query')>()),
	useImportRecords: () => ({ mutateAsync: async () => {} })
}));

vi.mock('$app/state', () => ({
	page: { route: { id: '/contracts/payments/[id]' }, url: new URL('http://localhost/') }
}));

beforeAll(layOutLists);

beforeEach(() => {
	loadLocale('en');
	setLocale('en');
});

afterEach(() => {
	forgetReader();
	vi.restoreAllMocks();
	document.body.innerHTML = '';
});

const providers = { wrapper: QueryProviders, wrapperProps: { strings, direction: 'ltr' as const } };

const page = () => render(PaymentDetails, { paymentId: payment.id }, providers);

const ledger = () => render(Ledger, { contractId: 'contract-1' }, providers);

test("the payment's page refuses the acts whose flags the reader lacks, naming each flag", () => {
	holdEveryFlagBut('editPayment', 'deletePayment', 'createPayment');
	page();

	expect(refusedControl(en.common.actions.edit)).toMatchObject({
		reason: en.common.permission.missing.editPayment,
		ariaDisabled: 'true'
	});
	expect(refusedControl(en.common.actions.delete)?.reason).toBe(
		en.common.permission.missing.deletePayment
	);
	expect(refusedControl(en.common.actions.duplicate)?.reason).toBe(
		en.common.permission.missing.createPayment
	);
	// the receipt reads the payment, which the reader may.
	expect(refusedControl(en.contracts.payments.receipt.print)).toBeUndefined();
});

test('the command menu does not offer a payment act whose flag the reader lacks', async () => {
	holdEveryFlagBut('editPayment');
	await openPalette();

	expect(paletteRow('payment.edit')).toBeNull();
	expect(paletteRow('payment.receipt')).not.toBeNull();
});

test('without viewing payments, the command menu offers none of their acts, the receipt included', async () => {
	holdEveryFlagBut('viewPayment');
	await openPalette();

	expect(paletteRow('payment.receipt')).toBeNull();
	expect(document.querySelector('[data-slot=command-item][data-value^="payment."]')).toBeNull();
	// adding one is its own flag, and it asks for the contract, which the reader may see.
	expect(paletteRow('create.payment')).not.toBeNull();
});

test("the ledger refuses a new payment and an import, naming the flag, before the contract's state", async () => {
	holdEveryFlagBut('createPayment');
	ledger();

	const create = document.querySelector('[data-create-control]');

	expect(create?.getAttribute('aria-disabled')).toBe('true');
	expect(describedBy(create)).toBe(en.common.permission.missing.createPayment);

	await fireEvent.click(screen.getByRole('button', { name: en.common.actions.transferData }));

	expect(describedBy(document.querySelector('[data-transfer="import"]'))).toBe(
		en.common.permission.missing.createPayment
	);
});

test('the ledger refuses deleting a selection to a reader who may not delete payments', async () => {
	vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(800);
	vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(600);

	holdEveryFlagBut('deletePayment');
	ledger();

	await fireEvent.click(document.querySelector<HTMLElement>('[data-select-control]')!);
	await waitFor(() =>
		expect(
			screen.getAllByRole('checkbox', { name: en.common.table.selectRecord })
		).not.toHaveLength(0)
	);
	await fireEvent.click(screen.getAllByRole('checkbox', { name: en.common.table.selectRecord })[0]);

	await waitFor(() => expect(refusedControl(en.common.actions.delete)).toBeDefined());
	expect(refusedControl(en.common.actions.delete)?.reason).toBe(
		en.common.permission.missing.deletePayment
	);
});

test('on a read-only grant every create, edit and delete on the page reads as refused for the grant', () => {
	holdReadOnly();
	page();

	for (const act of [
		en.common.actions.duplicate,
		en.common.actions.edit,
		en.common.actions.delete
	]) {
		expect(refusedControl(act)?.reason, act).toBe(en.common.permission.readOnly);
	}

	expect(refusedControl(en.contracts.payments.receipt.print)).toBeUndefined();
});
