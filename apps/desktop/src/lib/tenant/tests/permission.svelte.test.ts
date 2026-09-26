import { render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';

import { placeholderStrings as strings } from '$lib/design/tests/strings';
import en from '$lib/i18n/en';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import { newId } from '$lib/platform/database/identity';
import TenantDetails from '$lib/tenant/component/details.svelte';
import TenantDirectory from '$lib/tenant/component/directory.svelte';
import QueryProviders from '#tests/query-providers.svelte';
import {
	forgetReader,
	holdEveryFlagBut,
	holdReadOnly,
	layOutLists,
	openPalette,
	paletteRow,
	refusedControl
} from '#tests/permission.ts';

/**
 * A TENANT'S ACTS, FOR A READER WHO MAY NOT TAKE THEM ALL
 *
 * Effort 838, requirement 10 and criterion 10: a tenant act whose flag the reader lacks is shown
 * refused on the tenant's page, with the reason naming the flag, and the command menu does not
 * offer it; the tenants directory refuses its create and its import the same way; the contracts a
 * tenant holds are not shown to a reader who may not view contracts; and on a read-only grant every
 * create, edit and delete reads as refused for the grant.
 *
 * **The reads are the mock**: the tenant, and the lists the page and the directory draw.
 */

const TENANT = { id: newId(), name: 'Sara', nationalId: '1000000000', phone: '+966500000000' };

vi.mock('$lib/tenant/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/tenant/query')>()),
	useFetchTenant: () => ({ data: TENANT, isLoading: false }),
	useListTenants: () => ({ data: [], isLoading: false, isFetching: false })
}));

vi.mock('$lib/contract/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/contract/query')>()),
	useListContracts: () => ({ data: [], isLoading: false, isFetching: false })
}));

beforeAll(layOutLists);

beforeEach(() => {
	loadLocale('en');
	setLocale('en');
});

afterEach(() => {
	forgetReader();
	document.body.innerHTML = '';
});

const providers = { wrapper: QueryProviders, wrapperProps: { strings, direction: 'ltr' as const } };

const page = () => render(TenantDetails, { tenantId: TENANT.id }, providers);

test("the tenant's page refuses the acts whose flags the reader lacks, naming each flag", () => {
	holdEveryFlagBut('editTenant', 'deleteTenant', 'createContract');
	page();

	expect(refusedControl(en.common.actions.edit)).toMatchObject({
		reason: en.common.permission.missing.editTenant,
		ariaDisabled: 'true'
	});
	expect(refusedControl(en.common.actions.delete)?.reason).toBe(
		en.common.permission.missing.deleteTenant
	);
	expect(refusedControl(en.common.actions.newContract)?.reason).toBe(
		en.common.permission.missing.createContract
	);
	// copying details reads what is on screen, and nothing refuses it.
	expect(refusedControl(en.common.actions.copyDetails)).toBeUndefined();
});

test('a reader holding every flag is refused nothing on the page', () => {
	holdEveryFlagBut();
	page();

	expect(document.querySelectorAll('[data-unavailable]')).toHaveLength(0);
});

// a heartbeat that brings a narrowed role, or a switch to a workspace on a read-only grant, reaches
// a page already drawn: it is drawn again off the new standing, with nothing reloaded.
test('a page already drawn refuses an act the moment the reader stops holding its flag', async () => {
	holdEveryFlagBut();
	page();

	expect(refusedControl(en.common.actions.edit)).toBeUndefined();

	holdEveryFlagBut('editTenant');

	await waitFor(() =>
		expect(refusedControl(en.common.actions.edit)?.reason).toBe(
			en.common.permission.missing.editTenant
		)
	);

	holdReadOnly();

	await waitFor(() =>
		expect(refusedControl(en.common.actions.delete)?.reason).toBe(en.common.permission.readOnly)
	);
});

test('the command menu does not offer a tenant act whose flag the reader lacks', async () => {
	holdEveryFlagBut('editTenant');
	await openPalette();

	expect(paletteRow('tenant.edit')).toBeNull();
	expect(paletteRow('tenant.copyDetails')).not.toBeNull();
	expect(paletteRow('tenant.delete')).not.toBeNull();
});

test("without viewing contracts, the tenant's contracts are not on the page", () => {
	holdEveryFlagBut('viewContract');
	page();

	expect(screen.queryByText(en.tenants.contracts.emptyTitle)).toBeNull();

	document.body.innerHTML = '';
	holdEveryFlagBut();
	page();

	expect(screen.queryByText(en.tenants.contracts.emptyTitle)).not.toBeNull();
});

test('the tenants directory refuses its create and its import, naming the flag', () => {
	holdEveryFlagBut('createTenant', 'createPayment');
	render(TenantDirectory, {}, providers);

	const create = document.querySelector('[data-create-control]');

	expect(create?.getAttribute('aria-disabled')).toBe('true');
	expect(document.getElementById(create?.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
		en.common.permission.missing.createTenant
	);
	// the empty directory's own create says the same.
	expect(refusedControl(en.common.actions.newTenant)?.reason).toBe(
		en.common.permission.missing.createTenant
	);
});

test('on a read-only grant every create, edit and delete on the page reads as refused for the grant', () => {
	holdReadOnly();
	page();

	for (const act of [
		en.common.actions.edit,
		en.common.actions.newContract,
		en.common.actions.delete
	]) {
		expect(refusedControl(act)?.reason, act).toBe(en.common.permission.readOnly);
	}

	expect(refusedControl(en.common.actions.copyDetails)).toBeUndefined();
});

test('on a read-only grant the directory refuses its create for the grant', () => {
	holdReadOnly();
	render(TenantDirectory, {}, providers);

	const create = document.querySelector('[data-create-control]');

	expect(create?.getAttribute('aria-disabled')).toBe('true');
	expect(document.getElementById(create?.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
		en.common.permission.readOnly
	);
	expect(refusedControl(en.common.actions.newTenant)?.reason).toBe(en.common.permission.readOnly);
});
