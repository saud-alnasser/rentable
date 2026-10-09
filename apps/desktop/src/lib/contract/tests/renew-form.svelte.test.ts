import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { afterEach, expect, test, vi } from 'vitest';

import ContractForm from '$lib/contract/component/form.svelte';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import Providers from '#tests/providers.svelte';

/**
 * THE CONTRACT FORM, OPENED TO RENEW
 *
 * Requirement 8 of effort 861: a renewal may change the rent. The renew form opens with the cost
 * field enabled and filled with the predecessor's rent, and what the reader leaves there, changed
 * or not, is what it sends.
 *
 * **The predecessor read is stood in for**, through a partial mock of the contract's query module
 * (`read`), and **the renewal is stood in for** at its declared mutation, noting what each submit
 * sent (`submitted`); what the procedure does with it is `renewal/tests/router.test.ts`'s. The
 * tenant reads answer nothing, since the tenant is the predecessor's and locked.
 */

const { read, submitted } = vi.hoisted(() => ({
	read: { contract: undefined as unknown },
	/** what each submit handed the renewal, in order. */
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

vi.mock('$lib/contract/renewal/query', () => ({
	useRenewContract: () => ({
		isPending: false,
		mutateAsync: async (variables: Record<string, unknown>) => {
			submitted.push(variables);

			return { id: 'contract-2' };
		}
	})
}));

vi.mock('$lib/tenant/ui', () => ({
	useFetchTenants: () => ({ data: [], isLoading: false }),
	useFetchTenant: () => ({ data: undefined, isLoading: false })
}));

loadLocale('en');
setLocale('en');

const PREDECESSOR = {
	id: 'contract-1',
	govId: '4471',
	status: 'active',
	start: Date.UTC(2025, 0, 1),
	end: Date.UTC(2025, 11, 31),
	interval: '12m',
	cost: 48000,
	paidAmount: 48000,
	expectedAmount: 48000,
	tenantId: 'tenant-1',
	renewsContractId: null
};

afterEach(() => {
	document.body.innerHTML = '';
	submitted.length = 0;
});

const open = () =>
	render(
		ContractForm,
		{ renewsContractId: 'contract-1', open: true, onOpenChange: () => {} },
		{ wrapper: Providers, wrapperProps: { strings, direction: 'ltr' } }
	);

/** the cost field, the one money input on the surface. */
const cost = () => document.querySelector<HTMLInputElement>('input[inputmode=decimal]');

const submit = async () => {
	const button = document.querySelector<HTMLButtonElement>('button[type=submit]');

	await fireEvent.click(button!);
};

test('the renew form offers the cost, filled with the rent of the contract it renews', async () => {
	read.contract = PREDECESSOR;

	open();

	await waitFor(() => expect(cost()?.value).toBe('48000'));
	expect(cost()?.disabled).toBe(false);
});

test('a renewal at a changed cost sends that cost', async () => {
	read.contract = PREDECESSOR;

	open();

	await waitFor(() => expect(cost()?.value).toBe('48000'));
	await fireEvent.input(cost()!, { target: { value: '52000' } });
	await submit();

	await waitFor(() => expect(submitted).toHaveLength(1));
	expect(submitted[0]).toMatchObject({ contractId: 'contract-1', cost: 52000 });
});

test('a renewal at the cost it opened on sends the old rent', async () => {
	read.contract = PREDECESSOR;

	open();

	await waitFor(() => expect(cost()?.value).toBe('48000'));
	await submit();

	await waitFor(() => expect(submitted).toHaveLength(1));
	expect(submitted[0]).toMatchObject({ contractId: 'contract-1', cost: 48000 });
});
