import { render, waitFor } from '@testing-library/svelte';
import { expect, test, vi } from 'vitest';

import ContractHost from '$lib/contract/component/host.svelte';
import { contractHost } from '$lib/contract/host.svelte';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import QueryProviders from '#tests/query-providers.svelte';

/**
 * WHERE A NEW CONTRACT LANDS
 *
 * Requirement 16 of effort 832, criterion 16(b): after creating a contract, its record opens, which
 * is where its next step is. Read on the host the frame mounts, since landing is the host's to do.
 *
 * **The form is stood in for** (`./created-form.svelte`) by one that writes a contract as soon as it
 * is opened, and **the navigation is noted** rather than made (`went`). The address the host reads
 * is the dashboard's, so nothing about where the reader stood decides where they land.
 */

const { went } = vi.hoisted(() => ({ went: [] as string[] }));

vi.mock('$lib/contract/component/form.svelte', async () => ({
	default: (await import('./created-form.svelte')).default
}));

vi.mock('$app/navigation', async (importOriginal) => ({
	...(await importOriginal<typeof import('$app/navigation')>()),
	goto: async (address: string) => {
		went.push(address);
	}
}));

vi.mock('$app/state', () => ({
	page: { url: new URL('http://localhost/dashboard') }
}));

loadLocale('en');
setLocale('en');

test('creating a contract opens its record', async () => {
	render(
		ContractHost,
		{},
		{ wrapper: QueryProviders, wrapperProps: { strings, direction: 'ltr' } }
	);

	contractHost.create();

	await waitFor(() => expect(went).toEqual(['/contracts/contract-9']));
});
