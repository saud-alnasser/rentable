import { render, waitFor } from '@testing-library/svelte';
import { beforeEach, expect, test, vi } from 'vitest';

// what one feature reads of another in the window is provided as the surfaces are composed, as
// the frame does by importing them (`contributionsTo` in `$lib/feature/surface`).
import '$lib/app/surfaces';
import ComplexHost from '$lib/complex/component/host.svelte';
import UnitHost from '$lib/complex/unit/component/host.svelte';
import { complexActs, complexHost } from '$lib/complex/host.svelte';
import { unitActs } from '$lib/complex/unit/host.svelte';
import ContractHost from '$lib/contract/component/host.svelte';
import { contractActs, contractHost } from '$lib/contract/host.svelte';
import type { ContractActRecord } from '$lib/contract/acts';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import { LL, setLocale } from '$lib/i18n/i18n-svelte';
import { toCardActions, type RecordAct } from '$lib/act';
import en from '$lib/i18n/en';
import { get } from 'svelte/store';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import Providers from '#tests/providers.svelte';
import PaymentHost from '$lib/payment/component/host.svelte';
import { paymentActs } from '$lib/payment/host.svelte';
import TenantHost from '$lib/tenant/component/host.svelte';
import { tenantActs, tenantHost } from '$lib/tenant/host.svelte';
import { complexPlan } from './plan.svelte';

/**
 * WHAT A HOST DOES WITH A DELETE
 *
 * Requirement 11 of effort 832, criterion 11 (a) to (c), as effort 846 revised it on 2026-10-02
 * (requirement 2, criterion 2), read on the hosts the frame mounts: every record delete asks first,
 * from the card's menu as from anywhere, in the delete dialog saying undo brings the record back;
 * leaving the dialog deletes nothing and answering it deletes. A delete something refuses opens the
 * same dialog naming what refuses it, and terminating asks in the confirm dialog rather than the
 * delete dialog. That the undo the announcement offers puts the
 * record back is `delete-and-confirm.test.ts`'s, over the real procedures.
 *
 * **The hooks are stood in for**, through partial mocks of each concept's query module: what the
 * blockers read answers is the test's to set (`held`), and every delete or terminate the host
 * asks for is noted (`asked`). The forms the hosts also mount keep their real hooks, under the
 * query client `providers.svelte` supplies, and stay closed.
 *
 * The delete dialog and the confirm dialog are told apart by the attribute the confirm dialog
 * carries, `data-confirm-dialog`, so nothing here reads a word that changes with the locale.
 */

const { held, asked, address, noting, settled } = vi.hoisted(() => {
	/** what the blocker reads answer with, by what they read. */
	const held = {
		contracts: [] as unknown[],
		units: [] as unknown[],
		payments: [] as unknown[]
	};
	/** every write the hosts asked for, as `hook:id`. */
	const asked: string[] = [];

	return {
		held,
		asked,
		address: { url: new URL('http://localhost/dashboard') },
		/** a mutation hook that notes what it was asked and goes through. */
		noting: (hook: string) => () => ({
			isPending: false,
			mutateAsync: async (id: string) => {
				asked.push(`${hook}:${id}`);
			}
		}),
		/** a read that has settled on what the test said it holds. */
		settled: (read: () => unknown) => () => ({
			isPending: false,
			isPlaceholderData: false,
			get data() {
				return read();
			}
		})
	};
});

vi.mock('$lib/tenant/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/tenant/query')>()),
	useDeleteTenant: noting('deleteTenant'),
	useReadTenant: () => async () => undefined
}));

vi.mock('$lib/complex/query', async (importOriginal) => {
	const { complexPlan } = await import('./plan.svelte');

	return {
		...(await importOriginal<typeof import('$lib/complex/query')>()),
		// a delete that moves the plan the way the workspace does once the complex is gone, and
		// settles a moment later, so what the host reads in between is read.
		useDeleteComplex: () => ({
			isPending: false,
			mutateAsync: async (id: string) => {
				asked.push(`deleteComplex:${id}`);
				complexPlan.plan = {
					eligible: [],
					refused: [{ id, name: '', reason: 'missing' }],
					units: 0
				};
				await new Promise((resolve) => setTimeout(resolve, 30));
			}
		}),
		useReadComplex: () => async () => undefined,
		// the plan, which a test can leave refetching over what it cached before.
		usePlanManyComplexes: () => ({
			isPending: false,
			isPlaceholderData: false,
			get isFetching() {
				return complexPlan.fetching;
			},
			get data() {
				return complexPlan.plan;
			}
		})
	};
});

vi.mock('$lib/complex/unit/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/complex/unit/query')>()),
	useDeleteUnit: noting('deleteUnit'),
	useReadUnit: () => async () => undefined,
	useFetchUnits: settled(() => held.units)
}));

vi.mock('$lib/contract/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/contract/query')>()),
	useDeleteContract: noting('deleteContract'),
	useTerminateContract: noting('terminateContract'),
	useUnterminateContract: noting('unterminateContract'),
	useReadContract: () => async () => undefined,
	useListContracts: settled(() => held.contracts),
	useFetchContractUnits: settled(() => held.units)
}));

vi.mock('$lib/payment/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/payment/query')>()),
	useDeletePayment: noting('deletePayment'),
	useReadPayment: () => async () => undefined,
	useFetchContractPayments: settled(() => held.payments)
}));

vi.mock('$app/state', () => ({
	page: {
		get url() {
			return address.url;
		}
	}
}));

vi.mock('$app/navigation', async (importOriginal) => ({
	...(await importOriginal<typeof import('$app/navigation')>()),
	goto: async () => {}
}));

loadLocale('en');
setLocale('en');

beforeEach(() => {
	held.contracts = [];
	held.units = [];
	held.payments = [];
	complexPlan.plan = { eligible: [], refused: [], units: 0 };
	complexPlan.fetching = false;
	asked.length = 0;
});

const mount = (Host: Parameters<typeof render>[0]) =>
	render(Host, {}, { wrapper: Providers, wrapperProps: { strings, direction: 'ltr' } });

// the one drawn last: a dialog answered in the test before may still be on its way out.
const dialog = () => [...document.querySelectorAll('[data-slot="dialog-content"]')].at(-1) ?? null;

const confirmDialog = () => document.querySelector('[data-confirm-dialog]');

const tenant = { id: 'tenant-1', name: 'Noura', nationalId: '1000000001', phone: '+966500000001' };

const contract: ContractActRecord = {
	id: 'contract-1',
	govId: '4471',
	status: 'active',
	start: Date.UTC(2026, 0, 1),
	end: Date.UTC(2026, 11, 31),
	interval: '1m',
	cost: 1500,
	paidAmount: 0,
	expectedAmount: 18000,
	tenantId: 'tenant-1',
	renewsContractId: null,
	renewed: false,
	tenantName: 'Noura'
};

/** The dialog's own control, by the placeholder its word stands in as: `{cancel}` or `{delete}`. */
const control = (word: string) =>
	[...(dialog()?.querySelectorAll('button') ?? [])].find(
		(button) => button.textContent?.trim() === word
	);

/** Choose a record's act from its card's menu, the entry the card draws for it. */
function chooseFromCard<T>(acts: readonly RecordAct<T>[], actId: string, record: T) {
	const entry = toCardActions(acts, record, get(LL)).find(
		(action) => action.attributes?.['data-act'] === actId
	);

	expect(entry).toBeDefined();
	entry?.onSelect();
}

/**
 * The delete asks first, saying undo brings the record back: leaving it deletes nothing, and
 * answering it deletes the record once.
 */
async function asksThenDeletes(choose: () => void, written: string) {
	choose();

	await waitFor(() => expect(dialog()).not.toBeNull());
	expect(confirmDialog()).toBeNull();
	expect(dialog()?.textContent).toContain(en.common.deleteDialog.undoable);
	await waitFor(() => expect(control('{delete}')?.disabled).toBe(false));

	control('{cancel}')?.click();
	await waitFor(() => expect(dialog()).toBeNull());
	expect(asked).toEqual([]);

	choose();
	await waitFor(() => expect(control('{delete}')?.disabled).toBe(false));
	control('{delete}')?.click();

	await waitFor(() => expect(asked).toEqual([written]));
	// the dialog closes once the write lands, and nothing is written twice.
	await waitFor(() => expect(dialog()).toBeNull());
	expect(asked).toEqual([written]);
}

test('a tenant with no contracts asks first from its card, and is deleted once answered', async () => {
	mount(TenantHost);

	await asksThenDeletes(
		() => chooseFromCard(tenantActs, 'tenant.delete', tenant),
		'deleteTenant:tenant-1'
	);
});

test('a tenant with contracts is refused with what holds it, and nothing is deleted', async () => {
	held.contracts = [{ id: 'contract-1' }];
	mount(TenantHost);

	tenantHost.run('tenant.delete', tenant);

	await waitFor(() => expect(dialog()).not.toBeNull());
	expect(confirmDialog()).toBeNull();
	expect(dialog()?.textContent).toContain('1 contract');
	expect(asked).toEqual([]);
});

test('a unit asks first from its card, and is deleted once answered', async () => {
	mount(UnitHost);

	await asksThenDeletes(
		() =>
			chooseFromCard(unitActs, 'unit.delete', {
				id: 'unit-1',
				name: 'A1',
				status: 'vacant',
				complexId: 'c-1'
			}),
		'deleteUnit:unit-1'
	);
});

test('a payment asks first from its card, and is deleted once answered', async () => {
	mount(PaymentHost);

	await asksThenDeletes(
		() =>
			chooseFromCard(paymentActs, 'payment.delete', {
				id: 'payment-1',
				date: Date.UTC(2026, 1, 1),
				amount: 1500,
				contractId: 'contract-1',
				direction: 'received',
				contractStatus: 'active'
			}),
		'deletePayment:payment-1'
	);
});

test('a contract with no payments asks first from its card, and is deleted once answered', async () => {
	mount(ContractHost);

	await asksThenDeletes(
		() => chooseFromCard(contractActs, 'contract.delete', contract),
		'deleteContract:contract-1'
	);
});

const complex = { id: 'c-1', name: 'Tower', location: 'Riyadh' };

// effort 840, requirement 22, on the host: what a complex's delete does turns on its units.
test('a complex with no units asks first from its card, and is deleted once answered', async () => {
	complexPlan.plan = { eligible: ['c-1'], refused: [], units: 0 };
	mount(ComplexHost);

	await asksThenDeletes(
		() => chooseFromCard(complexActs, 'complex.delete', complex),
		'deleteComplex:c-1'
	);
});

// a plan cached before the workspace moved says no units go; until the fresh one lands, the dialog
// offers no delete, since what it says goes may not be what goes.
test('a complex whose plan is being fetched again asks, offers no delete yet, and deletes nothing', async () => {
	complexPlan.plan = { eligible: ['c-1'], refused: [], units: 0 };
	complexPlan.fetching = true;
	mount(ComplexHost);

	complexHost.run('complex.delete', complex);

	await waitFor(() => expect(dialog()).not.toBeNull());
	await new Promise((resolve) => setTimeout(resolve, 50));
	expect(control('{delete}')?.disabled).toBe(true);
	expect(asked).toEqual([]);
});

test('a complex whose units go with it asks first, naming them, and deletes once answered', async () => {
	complexPlan.plan = { eligible: ['c-1'], refused: [], units: 3 };
	mount(ComplexHost);

	complexHost.run('complex.delete', complex);

	await waitFor(() => expect(dialog()).not.toBeNull());
	expect(confirmDialog()).toBeNull();
	expect(dialog()?.textContent).toContain(
		'its 3 units will be deleted with it. you can undo this while the app is open.'
	);
	expect(asked).toEqual([]);

	// the destructive control, by the placeholder its word stands in as.
	const destructive = [...(dialog()?.querySelectorAll('button') ?? [])].find(
		(button) => button.textContent?.trim() === '{delete}'
	);

	expect(destructive).toBeDefined();
	destructive?.click();

	await waitFor(() => expect(asked).toEqual(['deleteComplex:c-1']));
	// its own write leaves the plan saying no units go; that is no second delete behind the dialog.
	await new Promise((resolve) => setTimeout(resolve, 80));
	expect(asked).toEqual(['deleteComplex:c-1']);
});

test('a complex a contract holds a unit of is refused with what holds it, and nothing is deleted', async () => {
	complexPlan.plan = {
		eligible: [],
		refused: [{ id: 'c-1', name: 'Tower', reason: 'units-under-contract' }],
		units: 0
	};
	mount(ComplexHost);

	complexHost.run('complex.delete', complex);

	await waitFor(() => expect(dialog()).not.toBeNull());
	expect(confirmDialog()).toBeNull();
	expect(dialog()?.textContent).toContain('a contract mentions one or more of its units');
	expect(asked).toEqual([]);
});

test('terminating asks in the confirm dialog, not the delete dialog', async () => {
	mount(ContractHost);

	contractHost.run('contract.terminate', contract);

	await waitFor(() => expect(confirmDialog()).not.toBeNull());
	expect(asked).toEqual([]);
});

test('restoring asks in the confirm dialog too', async () => {
	mount(ContractHost);

	contractHost.run('contract.restore', { ...contract, status: 'terminated' });

	await waitFor(() => expect(confirmDialog()).not.toBeNull());
	expect(asked).toEqual([]);
});
