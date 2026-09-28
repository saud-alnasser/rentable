import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';

import ContractDetails from '$lib/contract/component/details.svelte';
import ContractDirectory from '$lib/contract/component/directory.svelte';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import en from '$lib/i18n/en';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import { newId } from '$lib/platform/database/identity';
import TenantContracts from '$lib/tenant/component/contracts.svelte';
import QueryProviders from '#tests/query-providers.svelte';
import {
	describedBy,
	forgetReader,
	holdEveryFlagBut,
	holdReadOnly,
	layOutLists,
	openPalette,
	paletteRow,
	refusedControl,
	refusedControls
} from '#tests/permission.ts';

/**
 * A CONTRACT'S ACTS, FOR A READER WHO MAY NOT TAKE THEM ALL
 *
 * Effort 838, requirement 10 and criterion 10: a contract act whose flag the reader lacks is shown
 * refused on the contract's page, naming the flag, and the command menu does not offer it; the
 * three actions on a selection of contracts are refused the same way; the contract's payments are
 * not shown to a reader who may not view payments; a reader who may not view contracts is offered
 * none of their acts, the schedule's print among them; and on a read-only grant every create,
 * edit and delete reads as refused for the grant.
 *
 * **The reads are the mock**: the contract, its tenant, and the lists the page draws.
 */

const TENANT_ID = newId();

const CONTRACT = {
	id: newId(),
	govId: '4471',
	status: 'active' as const,
	start: Date.UTC(2026, 0, 1),
	end: Date.UTC(2026, 11, 31),
	interval: '1m' as const,
	cost: 1500,
	paidAmount: 0,
	expectedAmount: 18000,
	paymentCount: 0,
	tenantId: TENANT_ID,
	tenantName: 'Noura',
	rank: 'on-track'
};

vi.mock('$lib/contract/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/contract/query')>()),
	useFetchContract: () => ({ data: CONTRACT, isLoading: false }),
	useFetchContractSchedule: () => ({ data: [], isLoading: false }),
	useListContracts: () => ({ data: [CONTRACT], isLoading: false, isFetching: false }),
	usePlanManyContracts: () => ({ data: undefined })
}));

vi.mock('$lib/tenant/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/tenant/query')>()),
	useFetchTenant: () => ({
		data: { id: TENANT_ID, name: 'Noura', nationalId: '1000000001', phone: '+966500000001' },
		isLoading: false
	})
}));

vi.mock('$lib/payment/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/payment/query')>()),
	useListContractPayments: () => ({ data: [], isLoading: false, isFetching: false })
}));

vi.mock('$lib/history/query', () => ({
	useListHistory: () => ({ data: [], isLoading: false, isFetching: false })
}));

vi.mock('$app/state', () => ({
	page: { route: { id: '/contracts/[id]' }, url: new URL('http://localhost/contracts') }
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

const page = () => render(ContractDetails, { contractId: CONTRACT.id }, providers);

test("the contract's page refuses the acts whose flags the reader lacks, naming each flag", () => {
	holdEveryFlagBut('editContract', 'deleteContract', 'createContract');
	page();

	for (const act of [
		en.common.actions.edit,
		en.common.actions.renew,
		en.common.actions.terminate
	]) {
		expect(refusedControl(act)?.reason, act).toBe(en.common.permission.missing.editContract);
	}

	expect(refusedControl(en.common.actions.duplicate)?.reason).toBe(
		en.common.permission.missing.createContract
	);
	expect(refusedControl(en.common.actions.delete)?.reason).toBe(
		en.common.permission.missing.deleteContract
	);
	// printing the schedule reads the contract, which the reader may.
	expect(refusedControl(en.contracts.schedule.print)).toBeUndefined();
});

test('the command menu does not offer a contract act whose flag the reader lacks', async () => {
	holdEveryFlagBut('deleteContract');
	await openPalette();

	expect(paletteRow('contract.delete')).toBeNull();
	expect(paletteRow('contract.edit')).not.toBeNull();
	expect(paletteRow('contract.print')).not.toBeNull();
});

test('without viewing contracts, the command menu offers none of their acts, the schedule included', async () => {
	holdEveryFlagBut('viewContract');
	await openPalette();

	expect(paletteRow('contract.print')).toBeNull();
	expect(document.querySelector('[data-slot=command-item][data-value^="contract."]')).toBeNull();
	// a tenant's acts are still there: only the kind the reader may not view goes.
	expect(paletteRow('tenant.edit')).not.toBeNull();
});

test("without viewing payments, the contract's payments are not on its page", async () => {
	holdEveryFlagBut('viewPayment');
	page();

	expect(screen.queryByText(en.contracts.payments.emptyTitle)).toBeNull();
	expect(screen.queryByRole('link', { name: en.common.nav.payments })).toBeNull();

	document.body.innerHTML = '';
	holdEveryFlagBut();
	page();

	await waitFor(() => expect(screen.queryByText(en.contracts.payments.emptyTitle)).not.toBeNull());
});

test('the contracts directory refuses its create, naming the flag', () => {
	holdEveryFlagBut('createContract');
	render(ContractDirectory, {}, providers);

	const create = document.querySelector('[data-create-control]');

	expect(create?.getAttribute('aria-disabled')).toBe('true');
	expect(describedBy(create)).toBe(en.common.permission.missing.createContract);
});

test("the actions on a selection of a tenant's contracts are refused for the flags the reader lacks", async () => {
	vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(800);
	vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(600);

	holdEveryFlagBut('editContract', 'deleteContract', 'createContract');
	render(TenantContracts, { tenantId: TENANT_ID }, providers);

	// the pane's own create, which makes a contract, is refused for the create.
	const create = document.querySelector('[data-create-control]');

	expect(create?.getAttribute('aria-disabled')).toBe('true');
	expect(describedBy(create)).toBe(en.common.permission.missing.createContract);

	await fireEvent.click(document.querySelector<HTMLElement>('[data-select-control]')!);
	await waitFor(() =>
		expect(
			screen.getAllByRole('checkbox', { name: en.common.table.selectRecord })
		).not.toHaveLength(0)
	);
	await fireEvent.click(screen.getAllByRole('checkbox', { name: en.common.table.selectRecord })[0]);

	await waitFor(() => expect(refusedControls().length).toBeGreaterThanOrEqual(3));

	expect(refusedControl(en.common.actions.terminate)?.reason).toBe(
		en.common.permission.missing.editContract
	);
	expect(refusedControl(en.common.actions.unterminate)?.reason).toBe(
		en.common.permission.missing.editContract
	);
	expect(refusedControl(en.common.actions.delete)?.reason).toBe(
		en.common.permission.missing.deleteContract
	);
});

test('on a read-only grant every create, edit and delete on the page reads as refused for the grant', () => {
	holdReadOnly();
	page();

	for (const act of [
		en.common.actions.duplicate,
		en.common.actions.renew,
		en.common.actions.edit,
		en.common.actions.terminate,
		en.common.actions.delete
	]) {
		expect(refusedControl(act)?.reason, act).toBe(en.common.permission.readOnly);
	}

	expect(refusedControl(en.contracts.schedule.print)).toBeUndefined();
	expect(refusedControl(en.common.actions.copyDetails)).toBeUndefined();
});
