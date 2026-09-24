import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';

import UnitDetails from '$lib/complex/component/unit-details.svelte';
import ContractHost from '$lib/contract/component/host.svelte';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import en from '$lib/i18n/en';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import QueryProviders from '$lib/organization/tests/query-providers.svelte';
import { newId } from '$lib/platform/database/identity';
import TenantDetails from '$lib/tenant/component/details.svelte';

/**
 * A CONTRACT STARTED WHERE THE READER IS
 *
 * Requirement 21 of effort 832, criterion 21: a tenant's page and a unit's page each open the
 * contract form with that tenant or that unit already chosen. Read through what the reader does:
 * the record's page is drawn, its "new contract" control is pressed, and the contract host the
 * frame mounts opens its one form.
 *
 * **The reads are the mock**, through partial mocks of the three query modules: the page's own
 * record, the tenants and units the form names, and every list the page draws. What is asserted is
 * what reached the form, so nothing here writes.
 */

// minted the way a record's are, since a page reads only an address that names a record.
const TENANT = {
	id: newId(),
	name: 'Noura Alharbi',
	nationalId: '1000000001',
	phone: '+966500000001'
};

const UNIT = {
	id: newId(),
	name: 'A1',
	complexId: 'complex-1',
	complexName: 'Al Nakheel',
	status: 'occupied' as const
};

vi.mock('$lib/tenant/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/tenant/query')>()),
	// the page's read and the form's read of the tenant it names are the same one.
	useFetchTenant: (params: () => { id?: string }) => ({
		isLoading: false,
		get data() {
			return params().id === TENANT.id ? TENANT : undefined;
		}
	}),
	useFetchTenants: () => ({ isLoading: false, data: [] })
}));

vi.mock('$lib/complex/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/complex/query')>()),
	useFetchUnit: () => ({ isLoading: false, data: UNIT }),
	useReadUnit: () => async (id: string) => (id === UNIT.id ? UNIT : undefined)
}));

vi.mock('$lib/contract/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/contract/query')>()),
	useListContracts: () => ({ isLoading: false, isFetching: false, data: [] }),
	// no term is set when the form opens, so the free units are not read yet.
	useFetchAssignableUnitsForTerm: () => ({ isLoading: false, isFetching: false, data: undefined })
}));

beforeAll(() => {
	Element.prototype.scrollIntoView ??= () => {};
	window.ResizeObserver ??= class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
});

beforeEach(() => {
	loadLocale('en');
	setLocale('en');
});

afterEach(() => {
	document.body.innerHTML = '';
});

const providers = { wrapper: QueryProviders, wrapperProps: { strings, direction: 'ltr' as const } };

/** the page's "new contract" control, found by the act its projection carries. */
const newContract = () => screen.getByRole('button', { name: en.common.actions.newContract });

/** the contract form, once the host has opened it. */
const contractForm = () => screen.findByRole('dialog');

test("a tenant's page opens the contract form with the tenant chosen", async () => {
	render(ContractHost, {}, providers);
	render(TenantDetails, { tenantId: TENANT.id }, providers);

	await fireEvent.click(newContract());

	const form = await contractForm();

	await waitFor(() => expect(within(form).getAllByText(TENANT.name).length).toBeGreaterThan(0));
	// a new contract with nothing else chosen: the units field still waits on the term.
	expect(within(form).getByText(en.contracts.form.chooseUnits)).toBeTruthy();
});

test("a unit's page opens the contract form with the unit chosen", async () => {
	render(ContractHost, {}, providers);
	render(UnitDetails, { unitId: UNIT.id }, providers);

	await fireEvent.click(newContract());

	const form = await contractForm();

	// named from the unit's own read, since the form has no term yet to read the free units over.
	await waitFor(() =>
		expect(within(form).getByText(`${UNIT.name} · ${UNIT.complexName}`)).toBeTruthy()
	);
	expect(within(form).queryByText(en.contracts.form.chooseUnits)).toBeNull();
});
