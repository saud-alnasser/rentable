import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';

import { refuse } from '$lib/api/refusal';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import en from '$lib/i18n/en';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import TenantForm from '$lib/tenant/component/form.svelte';
import QueryProviders from '#tests/query-providers.svelte';

/**
 * THE TENANT FORM, REFUSED
 *
 * Ticket 38 of effort 832: no form swallows a refusal. The tenant's mutations turn the generic
 * error toast off, because the form places a taken national ID or phone beside its field; a
 * refusal it has no field for, such as the tenant being gone from under an edit, is still said,
 * through the shared handler, in the reader's words.
 *
 * **The tenant's mutations are stood in for**, and what the edit answers is the test's to set
 * (`answer`). The toast is stood in for too, and what it was asked to raise is what is asserted.
 */

const { answer, raised } = vi.hoisted(() => ({
	answer: { update: undefined as unknown },
	raised: [] as string[]
}));

vi.mock('svelte-sonner', () => ({
	toast: {
		success: () => {},
		error: (message: string) => raised.push(message),
		warning: () => {},
		dismiss: () => {}
	}
}));

vi.mock('$lib/tenant/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/tenant/query')>()),
	useCreateTenant: () => ({ isPending: false, mutateAsync: async () => ({ id: 'tenant-2' }) }),
	useUpdateTenant: () => ({
		isPending: false,
		mutateAsync: async () => {
			throw answer.update;
		}
	})
}));

loadLocale('en');
setLocale('en');

// jsdom lays nothing out and has no `scrollIntoView`, which a refused submit calls to bring the
// field into view. A no-op stands in; where the field lands is not what is asserted.
beforeAll(() => {
	Element.prototype.scrollIntoView ??= () => {};
});

beforeEach(() => {
	raised.length = 0;
});

afterEach(() => {
	document.body.innerHTML = '';
});

/** open the form on a tenant, rename them, and submit the edit. */
async function submitEdit() {
	render(
		TenantForm,
		{
			open: true,
			onOpenChange: () => {},
			value: { id: 'tenant-1', name: 'Sara', nationalId: '1234567890', phone: '+966551234567' }
		},
		{ wrapper: QueryProviders, wrapperProps: { strings, direction: 'ltr' } }
	);

	const name = screen.getByPlaceholderText(en.common.labels.name);

	await waitFor(() => expect((name as HTMLInputElement).value).toBe('Sara'));
	await fireEvent.input(name, { target: { value: 'Sami' } });
	await fireEvent.submit(document.querySelector<HTMLFormElement>('[data-slot=form-surface] form')!);
}

test('a refusal the form has no field for is said, in the reader’s words', async () => {
	answer.update = refuse('tenant.gone');

	await submitEdit();

	await waitFor(() => expect(raised).toEqual([en.common.refusals.tenant.gone]));
});

test('a refusal the form has a field for is placed there, and not raised as well', async () => {
	answer.update = refuse('tenant.phoneTaken');

	await submitEdit();

	await waitFor(() =>
		expect(document.body.textContent).toContain(en.common.refusals.tenant.phoneTaken)
	);
	expect(raised).toEqual([]);
});
