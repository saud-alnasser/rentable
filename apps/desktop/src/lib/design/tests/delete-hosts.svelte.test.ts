import { render, waitFor } from '@testing-library/svelte';
import { beforeEach, expect, test, vi } from 'vitest';

import ComplexHost from '$lib/complex/component/host.svelte';
import UnitHost from '$lib/complex/component/unit-host.svelte';
import { complexHost } from '$lib/complex/host.svelte';
import { unitHost } from '$lib/complex/unit/host.svelte';
import ContractHost from '$lib/contract/component/host.svelte';
import { contractHost } from '$lib/contract/host.svelte';
import type { ContractActRecord } from '$lib/contract/acts';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import QueryProviders from '$lib/organization/tests/query-providers.svelte';
import PaymentHost from '$lib/payment/component/host.svelte';
import { paymentHost } from '$lib/payment/host.svelte';
import TenantHost from '$lib/tenant/component/host.svelte';
import { tenantHost } from '$lib/tenant/host.svelte';

/**
 * WHAT A HOST DOES WITH A DELETE
 *
 * Requirement 11 of effort 832, criterion 11 (a) to (c), read on the hosts the frame mounts: a
 * delete whose act declares `none` and that nothing refuses runs at once with no dialog, a delete
 * something refuses opens the delete dialog naming what refuses it, and terminating asks in the
 * confirm dialog rather than the delete dialog. That the undo the announcement offers puts the
 * record back is `delete-and-confirm.test.ts`'s, over the real procedures.
 *
 * **The hooks are stood in for**, through partial mocks of each concept's query module: what the
 * blockers read answers is the test's to set (`held`), and every delete or terminate the host
 * asks for is noted (`asked`). The forms the hosts also mount keep their real hooks, under the
 * query client `query-providers.svelte` supplies, and stay closed.
 *
 * The delete dialog and the confirm dialog are told apart by the attribute the confirm dialog
 * carries, `data-confirm-dialog`, so nothing here reads a word that changes with the locale.
 */

const { held, asked, address, noting, settled } = vi.hoisted(() => {
	/** what the blocker reads answer with, by what they read. */
	const held = { contracts: [] as unknown[], units: [] as unknown[], payments: [] as unknown[] };
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
		settled: (read: () => unknown[]) => () => ({
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

vi.mock('$lib/complex/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/complex/query')>()),
	useDeleteComplex: noting('deleteComplex'),
	useDeleteUnit: noting('deleteUnit'),
	useReadComplex: () => async () => undefined,
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
	asked.length = 0;
});

const mount = (Host: Parameters<typeof render>[0]) =>
	render(Host, {}, { wrapper: QueryProviders, wrapperProps: { strings, direction: 'ltr' } });

const dialog = () => document.querySelector('[data-slot="dialog-content"]');

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
	tenantName: 'Noura'
};

test('a tenant with no contracts is deleted at once, with no dialog', async () => {
	mount(TenantHost);

	tenantHost.run('tenant.delete', tenant);

	await waitFor(() => expect(asked).toEqual(['deleteTenant:tenant-1']));
	expect(dialog()).toBeNull();
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

test('a unit is deleted at once, with no dialog', async () => {
	mount(UnitHost);

	unitHost.run('unit.delete', { id: 'unit-1', name: 'A1', status: 'vacant', complexId: 'c-1' });

	await waitFor(() => expect(asked).toEqual(['deleteUnit:unit-1']));
	expect(dialog()).toBeNull();
});

test('a payment is deleted at once, with no dialog', async () => {
	mount(PaymentHost);

	paymentHost.run('payment.delete', {
		id: 'payment-1',
		date: Date.UTC(2026, 1, 1),
		amount: 1500,
		contractId: 'contract-1',
		contractStatus: 'active'
	});

	await waitFor(() => expect(asked).toEqual(['deletePayment:payment-1']));
	expect(dialog()).toBeNull();
});

test('a contract with no payments is deleted at once, with no dialog', async () => {
	mount(ContractHost);

	contractHost.run('contract.delete', contract);

	await waitFor(() => expect(asked).toEqual(['deleteContract:contract-1']));
	expect(dialog()).toBeNull();
});

test('a complex with contracts asks first, and deletes nothing until it is answered', async () => {
	// a contract holds a unit, and a unit is what a complex's delete is weighed on.
	held.units = [{ id: 'unit-1' }];
	mount(ComplexHost);

	complexHost.run('complex.delete', { id: 'c-1', name: 'Tower', location: 'Riyadh' });

	await waitFor(() => expect(dialog()).not.toBeNull());
	expect(confirmDialog()).toBeNull();
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
