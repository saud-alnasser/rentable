import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';

import ComplexDirectory from '$lib/complex/component/directory.svelte';
import UnitDirectory from '$lib/complex/unit/component/directory.svelte';
import TenantContracts from '$lib/contract/component/tenant-contracts.svelte';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import en from '$lib/i18n/en';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import Ledger from '$lib/payment/component/ledger.svelte';
import TenantDirectory from '$lib/tenant/component/directory.svelte';
import Providers from '#tests/providers.svelte';
import { forgetReader, holdEveryFlagBut, layOutLists } from '#tests/permission.ts';

/**
 * A SELECTION'S DELETE ASKS FIRST
 *
 * Effort 846, requirement 2 as revised on 2026-10-02, and criterion 2: a domain record's delete
 * asks before anything is written from a selection as from a card's menu
 * (`delete-hosts.svelte.test.ts`). For each of the five record concepts, on the list that offers
 * a selection of it, deleting the selection opens the selection dialog; leaving it deletes
 * nothing, and answering it deletes what was selected.
 *
 * **The reads and the delete are the mock**: each list's rows, the plan the dialog reads, which
 * finds every record selected eligible, and the delete of many, which notes the ids it was asked
 * for (`asked`).
 */

const { asked, plannedAll, deletingMany } = vi.hoisted(() => {
	const asked: string[] = [];

	return {
		asked,
		/** a plan that finds every id it is asked about eligible. */
		plannedAll:
			(extra: object = {}) =>
			(ids: () => readonly string[]) => ({
				isPending: false,
				isFetching: false,
				isPlaceholderData: false,
				get data() {
					return ids().length > 0 ? { eligible: [...ids()], refused: [], ...extra } : undefined;
				}
			}),
		/** a delete of many that notes what it was asked for and deletes it. */
		deletingMany: () => ({
			isPending: false,
			mutateAsync: async ({ ids }: { ids: readonly string[] }) => {
				asked.push(...ids);

				return { deleted: ids.map((deleted) => ({ id: deleted })), refused: [] };
			}
		})
	};
});

const TENANT = { id: 'tenant-1', name: 'Sara', nationalId: '1000000000', phone: '+966500000000' };

const CONTRACT = {
	id: 'contract-1',
	govId: '4471',
	status: 'active' as const,
	start: Date.UTC(2026, 0, 1),
	end: Date.UTC(2026, 11, 31),
	interval: '1m' as const,
	cost: 1500,
	paidAmount: 0,
	expectedAmount: 18000,
	paymentCount: 0,
	tenantId: TENANT.id,
	tenantName: 'Sara',
	rank: 'on-track'
};

vi.mock('$lib/tenant/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/tenant/query')>()),
	useListTenants: () => ({ data: [TENANT], isLoading: false, isFetching: false }),
	usePlanManyTenants: plannedAll(),
	useDeleteManyTenants: deletingMany
}));

vi.mock('$lib/complex/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/complex/query')>()),
	useListComplexes: () => ({
		data: [{ id: 'complex-1', name: 'Tower', location: 'Riyadh' }],
		isLoading: false,
		isFetching: false
	}),
	usePlanManyComplexes: plannedAll({ units: 0 }),
	useDeleteManyComplexes: deletingMany
}));

vi.mock('$lib/complex/unit/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/complex/unit/query')>()),
	useFetchUnits: () => ({ data: [], isLoading: false }),
	useListUnits: () => ({
		data: [
			{
				id: 'unit-1',
				name: 'A1',
				complexId: 'complex-1',
				complexName: 'Tower',
				status: 'vacant',
				tenantName: null
			}
		],
		isLoading: false,
		isFetching: false
	}),
	usePlanManyUnits: plannedAll(),
	useDeleteManyUnits: deletingMany
}));

vi.mock('$lib/contract/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/contract/query')>()),
	useListContracts: () => ({ data: [CONTRACT], isLoading: false, isFetching: false }),
	useFetchContract: () => ({ data: CONTRACT, isLoading: false }),
	usePlanManyContracts: plannedAll()
}));

vi.mock('$lib/contract/selection/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/contract/selection/query')>()),
	useDeleteManyContracts: deletingMany
}));

vi.mock('$lib/payment/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/payment/query')>()),
	useListContractPayments: () => ({
		data: [{ id: 'payment-1', date: Date.UTC(2026, 2, 1), amount: 1500, contractId: CONTRACT.id }],
		isLoading: false,
		isFetching: false
	}),
	usePlanManyPayments: plannedAll(),
	useDeleteManyPayments: deletingMany
}));

vi.mock('$lib/history/query', () => ({
	useListHistory: () => ({ data: [], isLoading: false, isFetching: false })
}));

vi.mock('$lib/workspace/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/workspace/query')>()),
	useImportRecords: () => ({ mutateAsync: async () => {} })
}));

vi.mock('$app/state', () => ({
	page: { route: { id: '/contracts/[id]' }, url: new URL('http://localhost/') }
}));

beforeAll(layOutLists);

beforeEach(() => {
	loadLocale('en');
	setLocale('en');
	asked.length = 0;
	holdEveryFlagBut();
	// jsdom lays nothing out, so the list is given a viewport its rows can be drawn into.
	vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(800);
	vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(600);
});

afterEach(() => {
	vi.restoreAllMocks();
	forgetReader();
	document.body.innerHTML = '';
});

const dialog = () => [...document.querySelectorAll('[data-slot="dialog-content"]')].at(-1) ?? null;

/** a button by the words it starts with, inside `within` or anywhere. */
const button = (words: string, within: ParentNode = document) =>
	[...within.querySelectorAll<HTMLButtonElement>('button')].find((candidate) =>
		candidate.textContent?.trim().toLowerCase().startsWith(words.toLowerCase())
	);

/** turn on selecting and pick the first record. */
async function selectTheFirst() {
	await fireEvent.click(document.querySelector<HTMLElement>('[data-select-control]')!);
	await waitFor(() =>
		expect(
			screen.getAllByRole('checkbox', { name: en.common.table.selectRecord })
		).not.toHaveLength(0)
	);
	await fireEvent.click(screen.getAllByRole('checkbox', { name: en.common.table.selectRecord })[0]);
}

/** ask to delete what is selected, from the bar above the records. */
async function askToDeleteTheSelection() {
	await waitFor(() => expect(button(`${en.common.actions.delete} ·`)).toBeDefined());
	await fireEvent.click(button(`${en.common.actions.delete} ·`)!);
	await waitFor(() => expect(dialog()).not.toBeNull());
}

const cases: { concept: string; mount: () => void; id: string }[] = [
	{ concept: 'tenants', mount: () => surface(TenantDirectory, {}), id: TENANT.id },
	{ concept: 'complexes', mount: () => surface(ComplexDirectory, {}), id: 'complex-1' },
	{
		concept: 'units',
		mount: () => surface(UnitDirectory, { complexId: 'complex-1', complexName: 'Tower' }),
		id: 'unit-1'
	},
	{
		concept: 'contracts',
		mount: () => surface(TenantContracts, { recordId: TENANT.id }),
		id: CONTRACT.id
	},
	{
		concept: 'payments',
		mount: () => surface(Ledger, { recordId: CONTRACT.id }),
		id: 'payment-1'
	}
];

function surface(Surface: Parameters<typeof render>[0], props: object) {
	render(Surface, props, {
		wrapper: Providers,
		wrapperProps: { strings, direction: 'ltr' as const }
	});
}

for (const { concept, mount, id } of cases) {
	test(`deleting a selection of ${concept} asks first: leaving deletes nothing, answering deletes`, async () => {
		mount();

		await selectTheFirst();
		await askToDeleteTheSelection();
		expect(asked).toEqual([]);

		// leaving, by the dialog's own tertiary control.
		await fireEvent.click(button('{cancel}', dialog()!)!);
		await waitFor(() => expect(dialog()).toBeNull());
		expect(asked).toEqual([]);

		await askToDeleteTheSelection();
		await waitFor(() => expect(button(en.common.actions.delete, dialog()!)?.disabled).toBe(false));
		await fireEvent.click(button(en.common.actions.delete, dialog()!)!);

		await waitFor(() => expect(asked).toEqual([id]));
	});
}
