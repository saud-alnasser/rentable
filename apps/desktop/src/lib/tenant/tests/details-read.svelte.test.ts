import { render, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { shownRecord } from '@rentable/design/shown-record.svelte.js';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import { newId } from '$lib/platform/database/identity';
import TenantDetails from '$lib/tenant/component/details.svelte';
import Providers from '#tests/providers.svelte';
import { forgetReader, holdEveryFlagBut } from '#tests/permission.ts';

/**
 * A TENANT'S PAGE, WHEN ITS READ FAILS
 *
 * Ticket 04 of effort 861, requirement 1 and criterion 1: a record whose read failed says the read
 * failed, with *try again*, and never that the record does not exist. *Try again* runs the read
 * again, and a read that then answers draws the tenant. A tenant that is not there is still not
 * found: the read answered, with nothing.
 *
 * **What reaches Rust is stood in for**: the tenant's read at the caller, so the page's own query
 * runs as it does in the window, against a host that refuses it, answers it, or answers with
 * nothing.
 */

const TENANT = { id: newId(), name: 'Sara', nationalId: '1000000000', phone: '+966500000000' };

const host = vi.hoisted(() => ({ tenantGet: vi.fn() }));

vi.mock('$lib/api/caller', () => ({
	default: { tenant: { get: (input: unknown) => host.tenantGet(input) } }
}));

beforeEach(() => {
	loadLocale('en');
	setLocale('en');
	holdEveryFlagBut();
	host.tenantGet.mockReset();
});

afterEach(() => {
	forgetReader();
	document.body.innerHTML = '';
});

const page = () =>
	render(
		TenantDetails,
		{ tenantId: TENANT.id },
		{ wrapper: Providers, wrapperProps: { strings, direction: 'ltr' as const } }
	);

const empty = () => document.querySelector<HTMLElement>('[data-empty]');

test('a tenant whose read failed says so, and never that it does not exist', async () => {
	host.tenantGet.mockRejectedValue(new Error('the workspace could not be read'));
	page();

	await waitFor(() => expect(empty()?.dataset.empty).toBe('failed'));

	expect(empty()?.textContent).toContain(strings.readFailed);
	expect(document.body.textContent).not.toContain(strings.recordNotFound);
	// the trail names nothing, as it does while the record is on its way: nothing said whether
	// there is a tenant to name.
	expect(shownRecord.name).toBeUndefined();
});

test('try again runs the read again, and a read that answers draws the tenant', async () => {
	host.tenantGet.mockRejectedValueOnce(new Error('the workspace could not be read'));
	host.tenantGet.mockResolvedValue(TENANT);
	page();

	await waitFor(() => expect(empty()?.dataset.empty).toBe('failed'));

	expect(host.tenantGet).toHaveBeenCalledTimes(1);

	within(empty()!).getByRole('button', { name: strings.tryAgain }).click();

	await waitFor(() => expect(document.querySelector('h1')?.textContent).toBe('Sara'));

	expect(host.tenantGet).toHaveBeenCalledTimes(2);
	expect(empty()).toBeNull();
});

// the read answers with nothing for a tenant that is not there, which the query client would take
// for a failure; it is a record that does not exist, and says so.
test('a tenant the read answers with nothing for is not found, and not a failed read', async () => {
	host.tenantGet.mockResolvedValue(undefined);
	page();

	await waitFor(() => expect(empty()?.dataset.empty).toBe('not-found'));

	expect(document.body.textContent).toContain(strings.recordNotFound);
	expect(document.body.textContent).not.toContain(strings.readFailed);
	expect(shownRecord.name).toBeNull();
});
