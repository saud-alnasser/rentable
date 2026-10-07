import { render } from '@testing-library/svelte';
import { flushSync, type Component } from 'svelte';
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';

import { placeholderStrings as strings } from '$lib/design/tests/strings';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import Providers from '#tests/providers.svelte';
import { forgetReader, holdEveryFlagBut, layOutLists } from '#tests/permission.ts';

import ComplexRoute from '../complexes/[id]/+page.svelte';
import UnitRoute from '../complexes/units/[id]/+page.svelte';
import ContractRoute from '../contracts/[id]/+page.svelte';
import PaymentRoute from '../contracts/payments/[id]/+page.svelte';
import ContractUnitsRoute from '../contracts/units/[id]/+page.svelte';
import TenantRoute from '../tenants/[id]/+page.svelte';
import { standAt } from './address.svelte';

/**
 * A RECORD PAGE FOLLOWS ITS ADDRESS
 *
 * Effort 854, requirement 2 and criterion 2: moving from one record to another of the same kind,
 * by renewal, the palette, a link or the back button, keeps the route mounted and changes only
 * its parameter. Each record route is rendered at one record, the address is moved to a second
 * of the same kind, and the page shows the second record and none of the first.
 *
 * **The reads are the mock**, and each answers by the id it is asked for, so a page still asking
 * for the first record still draws it.
 */

const records = vi.hoisted(() => {
	// record ids, since a page asks for nothing that is not one.
	const id = {
		tenantA: '0192a000-0000-7000-8000-000000000001',
		tenantB: '0192a000-0000-7000-8000-000000000002',
		contractA: '0192a000-0000-7000-8000-000000000003',
		contractB: '0192a000-0000-7000-8000-000000000004',
		complexA: '0192a000-0000-7000-8000-000000000005',
		complexB: '0192a000-0000-7000-8000-000000000006',
		unitA: '0192a000-0000-7000-8000-000000000007',
		unitB: '0192a000-0000-7000-8000-000000000008',
		paymentA: '0192a000-0000-7000-8000-000000000009',
		paymentB: '0192a000-0000-7000-8000-000000000010'
	};
	const contract = (id: string, govId: string, tenantId: string, tenantName: string) => ({
		id,
		govId,
		status: 'active' as const,
		start: Date.UTC(2026, 0, 1),
		end: Date.UTC(2026, 11, 31),
		interval: '1m' as const,
		cost: 1500,
		paidAmount: 0,
		expectedAmount: 18000,
		paymentCount: 0,
		tenantId,
		tenantName,
		rank: 'on-track'
	});
	const payment = (id: string, contractId: string, govId: string, tenantName: string) => ({
		id,
		date: Date.UTC(2026, 2, 1),
		amount: 1500,
		contractId,
		contractGovId: govId,
		contractStatus: 'active' as const,
		tenantName,
		method: null,
		reference: null,
		note: null
	});

	return {
		id,
		tenants: {
			[id.tenantA]: {
				id: id.tenantA,
				name: 'Sara Alotaibi',
				nationalId: '1000000000',
				phone: '+966500000000'
			},
			[id.tenantB]: {
				id: id.tenantB,
				name: 'Huda Alshehri',
				nationalId: '1000000001',
				phone: '+966500000001'
			}
		} as Record<string, unknown>,
		contracts: {
			[id.contractA]: contract(id.contractA, '4471', id.tenantA, 'Sara Alotaibi'),
			[id.contractB]: contract(id.contractB, '5582', id.tenantB, 'Huda Alshehri')
		} as Record<string, unknown>,
		complexes: {
			[id.complexA]: { id: id.complexA, name: 'Al Nakheel', location: 'Riyadh' },
			[id.complexB]: { id: id.complexB, name: 'Al Yasmin', location: 'Jeddah' }
		} as Record<string, unknown>,
		units: {
			[id.unitA]: {
				id: id.unitA,
				name: 'Unit Amber',
				complexId: id.complexA,
				complexName: 'Al Nakheel',
				status: 'vacant' as const
			},
			[id.unitB]: {
				id: id.unitB,
				name: 'Unit Birch',
				complexId: id.complexB,
				complexName: 'Al Yasmin',
				status: 'vacant' as const
			}
		} as Record<string, unknown>,
		payments: {
			[id.paymentA]: payment(id.paymentA, id.contractA, '4471', 'Sara Alotaibi'),
			[id.paymentB]: payment(id.paymentB, id.contractB, '5582', 'Huda Alshehri')
		} as Record<string, unknown>
	};
});

// a read answering by the id it is asked for, followed on every access so that a page asking
// again for a new id is answered with the new record. Hoisted with the mocks that use it.
const { fetchBy, emptyList } = vi.hoisted(() => ({
	fetchBy: (table: Record<string, unknown>, id: () => string) => ({
		isLoading: false,
		get data() {
			return table[id()];
		}
	}),
	emptyList: () => ({ data: [], isLoading: false, isFetching: false })
}));

vi.mock('$app/state', async () => {
	const { address } = await import('./address.svelte');

	return {
		page: {
			get params() {
				return address.params;
			},
			get route() {
				return address.route;
			},
			get url() {
				return new URL(address.path, 'http://localhost');
			}
		}
	};
});

vi.mock('$lib/tenant/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/tenant/query')>()),
	useFetchTenant: (params: () => { id: string }) => fetchBy(records.tenants, () => params().id),
	useListTenants: emptyList
}));

vi.mock('$lib/contract/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/contract/query')>()),
	useFetchContract: (id: () => string) => fetchBy(records.contracts, id),
	useFetchContractSchedule: () => ({ data: [], isLoading: false }),
	useListContracts: emptyList,
	usePlanManyContracts: () => ({ data: undefined })
}));

vi.mock('$lib/complex/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/complex/query')>()),
	useFetchComplex: (id: () => string) => fetchBy(records.complexes, id),
	useListComplexes: emptyList
}));

vi.mock('$lib/complex/unit/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/complex/unit/query')>()),
	useFetchUnit: (id: () => string) => fetchBy(records.units, id),
	useFetchUnits: () => ({ data: [], isLoading: false }),
	useListUnits: emptyList,
	useDeleteManyUnits: () => ({ mutateAsync: async () => ({ deleted: [] }) }),
	usePlanManyUnits: () => ({ data: undefined })
}));

vi.mock('$lib/payment/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/payment/query')>()),
	useFetchPayment: (id: () => string) => fetchBy(records.payments, id),
	useListContractPayments: emptyList,
	useDeleteManyPayments: () => ({ mutateAsync: async () => ({ deleted: [] }) }),
	usePlanManyPayments: () => ({ data: undefined })
}));

vi.mock('$lib/history/query', () => ({
	useListHistory: emptyList
}));

vi.mock('$lib/workspace/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/workspace/query')>()),
	useImportRecords: () => ({ mutateAsync: async () => {} })
}));

beforeAll(layOutLists);

beforeEach(() => {
	loadLocale('en');
	setLocale('en');
	holdEveryFlagBut();
});

afterEach(() => {
	forgetReader();
	document.body.innerHTML = '';
});

const providers = { wrapper: Providers, wrapperProps: { strings, direction: 'ltr' as const } };

type Move = {
	kind: string;
	route: Component;
	routeId: string;
	path: (id: string) => string;
	first: { id: string; shows: string };
	second: { id: string; shows: string };
};

const moves: Move[] = [
	{
		kind: 'tenant',
		route: TenantRoute,
		routeId: '/tenants/[id]',
		path: (id) => `/tenants/${id}`,
		first: { id: records.id.tenantA, shows: 'Sara Alotaibi' },
		second: { id: records.id.tenantB, shows: 'Huda Alshehri' }
	},
	{
		kind: 'contract',
		route: ContractRoute,
		routeId: '/contracts/[id]',
		path: (id) => `/contracts/${id}`,
		first: { id: records.id.contractA, shows: '4471' },
		second: { id: records.id.contractB, shows: '5582' }
	},
	{
		kind: 'complex',
		route: ComplexRoute,
		routeId: '/complexes/[id]',
		path: (id) => `/complexes/${id}`,
		first: { id: records.id.complexA, shows: 'Al Nakheel' },
		second: { id: records.id.complexB, shows: 'Al Yasmin' }
	},
	{
		kind: 'unit',
		route: UnitRoute,
		routeId: '/complexes/units/[id]',
		path: (id) => `/complexes/units/${id}`,
		first: { id: records.id.unitA, shows: 'Unit Amber' },
		second: { id: records.id.unitB, shows: 'Unit Birch' }
	},
	{
		kind: 'payment',
		route: PaymentRoute,
		routeId: '/contracts/payments/[id]',
		path: (id) => `/contracts/payments/${id}`,
		first: { id: records.id.paymentA, shows: 'Sara Alotaibi' },
		second: { id: records.id.paymentB, shows: 'Huda Alshehri' }
	},
	{
		kind: "contract's units",
		route: ContractUnitsRoute,
		routeId: '/contracts/units/[id]',
		path: (id) => `/contracts/units/${id}`,
		first: { id: records.id.contractA, shows: '4471' },
		second: { id: records.id.contractB, shows: '5582' }
	}
];

test.each(moves)(
	'the $kind page moves to the second record when its address does',
	({ route, routeId, path, first, second }) => {
		standAt(routeId, path(first.id), first.id);
		render(route, {}, providers);

		expect(document.body.textContent).toContain(first.shows);
		expect(document.body.textContent).not.toContain(second.shows);

		standAt(routeId, path(second.id), second.id);
		flushSync();

		expect(document.body.textContent).toContain(second.shows);
		expect(document.body.textContent).not.toContain(first.shows);
	}
);
