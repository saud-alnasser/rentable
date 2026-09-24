import { render } from '@testing-library/svelte';
import { beforeEach, expect, test, vi } from 'vitest';

import Units from '$lib/contract/component/units.svelte';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import {
	insideTheWait,
	pastTheWait,
	pressSearchKey,
	searchField,
	searchGlass,
	typeSearch
} from '$lib/design/tests/search';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import { DesignProvider } from '@rentable/design/strings.js';

/**
 * THE CONTRACT'S UNIT PANES, SEARCHED
 *
 * Criterion 7(a) of [[efforts/832-the-interface-speaks-one-language-and-guides/spec]]: the panes
 * search with the list shell's field, its wait and `/`, where they had a bare input that searched
 * on every keystroke and answered no key.
 *
 * **The reads are the mock**, because what the panes hand their read is the search: the
 * assignable read is handed a thunk, and what that thunk answers is what the query would be asked.
 */

const { reads } = vi.hoisted(() => ({
	reads: { assignable: null as null | (() => { contractId: string; search: string }) }
}));

vi.mock('$lib/contract/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/contract/query')>()),
	useFetchContract: () => ({ data: { status: 'active', paidAmount: 0 } }),
	useFetchAssignableContractUnits: (args: () => { contractId: string; search: string }) => {
		reads.assignable = args;

		return { data: [], isLoading: false };
	},
	useFetchContractUnits: () => ({ data: [], isFetching: false }),
	useSetContractUnits: () => ({ isPending: false, mutate: () => {} })
}));

/** the search the assignable read is being asked for right now. */
const askedSearch = () => reads.assignable?.().search;

beforeEach(() => {
	loadLocale('en');
	setLocale('en');
	reads.assignable = null;

	window.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
});

const units = () =>
	render(
		Units,
		{ contractId: 'contract-1' },
		{ wrapper: DesignProvider, wrapperProps: { strings, direction: 'ltr' } }
	);

test('the panes lead their search with the glass', () => {
	units();

	expect(searchGlass()).not.toBeNull();
});

test('the panes ask their read for a term only once the reader stops typing', async () => {
	units();

	await typeSearch('A-10');
	await insideTheWait();
	expect(askedSearch()).toBe('');

	await pastTheWait();
	expect(askedSearch()).toBe('A-10');
});

test("the search key puts the cursor in the panes' field", async () => {
	units();

	await pressSearchKey();

	expect(document.activeElement).toBe(searchField());
});
