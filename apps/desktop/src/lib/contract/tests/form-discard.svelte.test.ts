import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';

import ContractForm from '$lib/contract/component/form.svelte';
import type { ContractFormContract } from '$lib/contract/form';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import en from '$lib/i18n/en';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import type { Contract } from '$lib/platform/database/schema';
import { layOutLists } from '#tests/permission.ts';
import Providers from '#tests/providers.svelte';

/**
 * THE CONTRACT FORM, OPENED TO RENEW OR DUPLICATE
 *
 * Requirement 10 of effort 861: a form with changes asks before it closes, and one with none
 * closes at once. Renew and duplicate both open the form already filled, a renewal with the term
 * that follows the contract it renews and a duplicate with the contract it copies, and neither
 * filling is the reader's. An untouched one closes at once; one with a field changed asks.
 *
 * A renewal is opened on an identity and filled once the contract it renews has been read, so
 * here that read arrives after the form has opened, as it does in the application.
 *
 * **The reads are the mock**, as in `started-from-a-record.svelte.test.ts`: the contract renewed,
 * the tenant the form names and the units a new contract may take. Nothing here writes.
 */

const TENANT = {
	id: 'tenant-1',
	name: 'Noura Alharbi',
	nationalId: '1000000001',
	phone: '+966500000001'
};

const CONTRACT: Contract = {
	id: 'contract-1',
	govId: 'EJ-1',
	status: 'active',
	start: Date.UTC(2026, 0, 1),
	end: Date.UTC(2026, 11, 31),
	interval: '3m',
	cost: 3000,
	paidAmount: 0,
	expectedAmount: 12000,
	tenantId: TENANT.id,
	renewsContractId: null
};

/** the contract being renewed, as its read holds it: nothing until it arrives. */
const predecessor = $state<{ data: Contract | undefined }>({ data: undefined });

vi.mock('$lib/contract/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/contract/query')>()),
	useFetchContract: () => ({
		get data() {
			return predecessor.data;
		}
	}),
	useFetchAssignableUnitsForTerm: () => ({ isLoading: false, isFetching: false, data: [] })
}));

vi.mock('$lib/tenant/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/tenant/query')>()),
	useFetchTenant: () => ({ isLoading: false, data: TENANT }),
	useFetchTenants: () => ({ isLoading: false, data: [TENANT] })
}));

vi.mock('$lib/complex/unit/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/complex/unit/query')>()),
	useReadUnit: () => async () => undefined
}));

beforeAll(layOutLists);

beforeEach(() => {
	loadLocale('en');
	setLocale('en');
});

afterEach(() => {
	document.body.innerHTML = '';
	predecessor.data = undefined;
});

const providers = { wrapper: Providers, wrapperProps: { strings, direction: 'ltr' as const } };

const question = () => document.querySelector('[data-confirm-dialog]');

const govId = () =>
	screen.getByPlaceholderText<HTMLInputElement>(en.common.labels.governmentIdOptional);

const cancel = () =>
	screen
		.getAllByRole('button')
		.find((button) => button.textContent?.trim() === en.common.actions.cancel)!;

/** the form, once the surface has taken focus as it does on open. */
async function settled() {
	await waitFor(() =>
		expect(govId().closest('[role=dialog]')?.contains(document.activeElement)).toBe(true)
	);
}

/** opens the form to renew the contract, with the contract's read arriving after it opened. */
async function openRenewal() {
	const onOpenChange = vi.fn();

	render(ContractForm, { renewsContractId: CONTRACT.id, open: true, onOpenChange }, providers);

	await settled();
	predecessor.data = CONTRACT;

	// the renewal's term starts the day after the renewed contract ends.
	await waitFor(() =>
		expect(document.querySelector('[data-slot=form-surface]')?.textContent).toContain('2027')
	);

	return onOpenChange;
}

/** opens the form to duplicate the contract, as the duplicate act does. */
async function openDuplicate() {
	const onOpenChange = vi.fn();
	const value: ContractFormContract = { ...CONTRACT, id: undefined, govId: '' };

	render(ContractForm, { value, open: true, onOpenChange }, providers);

	await settled();

	return onOpenChange;
}

const opens = { renew: openRenewal, duplicate: openDuplicate } as const;

for (const [mode, open] of Object.entries(opens)) {
	test(`${mode} nobody has touched closes on Escape without asking`, async () => {
		const onOpenChange = await open();

		govId().focus();
		await fireEvent.keyDown(govId(), { key: 'Escape' });

		await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
		expect(question()).toBeNull();
	});

	test(`${mode} nobody has touched closes on cancel without asking`, async () => {
		const onOpenChange = await open();

		await fireEvent.click(cancel());

		await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
		expect(question()).toBeNull();
	});

	test(`${mode} with a field changed asks before Escape closes it`, async () => {
		const onOpenChange = await open();

		await fireEvent.input(govId(), { target: { value: 'EJ-2' } });
		govId().focus();
		await fireEvent.keyDown(govId(), { key: 'Escape' });

		await waitFor(() => expect(question()).not.toBeNull());
		expect(onOpenChange).not.toHaveBeenCalled();
	});

	test(`${mode} with a field changed asks before cancel closes it`, async () => {
		const onOpenChange = await open();

		await fireEvent.input(govId(), { target: { value: 'EJ-2' } });
		await fireEvent.click(cancel());

		await waitFor(() => expect(question()).not.toBeNull());
		expect(onOpenChange).not.toHaveBeenCalled();
	});
}
