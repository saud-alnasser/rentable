import { render, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';

import { placeholderStrings as strings } from '$lib/design/tests/strings';
import en from '$lib/i18n/en';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import TenantDirectory from '$lib/tenant/component/directory.svelte';
import Providers from '#tests/providers.svelte';
import { forgetReader, holdEveryFlagBut, layOutLists } from '#tests/permission.ts';

/**
 * THE TENANTS DIRECTORY, WHEN ITS READ FAILS
 *
 * Ticket 03 of effort 861, requirement 1 and criterion 1: a directory whose read failed says the
 * read failed, with *try again*, and never *no tenants yet* or the create that fills an empty
 * set. *Try again* runs the read again, and a read that then answers draws the tenants.
 *
 * **What reaches Rust is stood in for**: the directory's read at the caller, so the screen's own
 * query runs as it does in the window, against a host that refuses it and then answers.
 */

const TENANT = { id: 'tenant-1', name: 'Sara', nationalId: '1000000000', phone: '+966500000000' };

const host = vi.hoisted(() => ({ tenantGetMany: vi.fn() }));

vi.mock('$lib/api/caller', () => ({
	default: { tenant: { getMany: (input: unknown) => host.tenantGetMany(input) } }
}));

beforeAll(layOutLists);

beforeEach(() => {
	loadLocale('en');
	setLocale('en');
	holdEveryFlagBut();
	host.tenantGetMany.mockReset();
	// jsdom lays nothing out, so the list is given a viewport its rows can be drawn into.
	vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(800);
	vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(600);
});

afterEach(() => {
	vi.restoreAllMocks();
	forgetReader();
	document.body.innerHTML = '';
});

const directory = () =>
	render(
		TenantDirectory,
		{},
		{ wrapper: Providers, wrapperProps: { strings, direction: 'ltr' as const } }
	);

const empty = () => document.querySelector<HTMLElement>('[data-empty]');

test('a directory whose read failed says so, and offers neither its create nor nothing yet', async () => {
	host.tenantGetMany.mockRejectedValue(new Error('the workspace could not be read'));
	directory();

	await waitFor(() => expect(empty()?.dataset.empty).toBe('failed'));

	expect(empty()?.textContent).toContain(strings.readFailed);
	expect(document.body.textContent).not.toContain(en.tenants.empty.title);
	expect(document.querySelector('[data-empty-create]')).toBeNull();
	expect(document.querySelector('[data-list-count]')).toBeNull();
});

test('try again runs the read again, and a read that answers draws the tenants', async () => {
	host.tenantGetMany.mockRejectedValueOnce(new Error('the workspace could not be read'));
	host.tenantGetMany.mockResolvedValue([TENANT]);
	directory();

	await waitFor(() => expect(empty()?.dataset.empty).toBe('failed'));

	expect(host.tenantGetMany).toHaveBeenCalledTimes(1);

	within(empty()!).getByRole('button', { name: strings.tryAgain }).click();

	await waitFor(() => expect(document.body.textContent).toContain('Sara'));

	expect(host.tenantGetMany).toHaveBeenCalledTimes(2);
	expect(empty()).toBeNull();
});
