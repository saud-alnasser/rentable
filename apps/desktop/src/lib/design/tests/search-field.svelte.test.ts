import { render } from '@testing-library/svelte';
import { beforeEach, expect, test } from 'vitest';

import SearchField from '$lib/design/block/search-field.svelte';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';

import ListSearchHarness from './list-search-harness.svelte';
import {
	insideTheWait,
	pastTheWait,
	pressSearchKey,
	searchField,
	searchGlass,
	typeSearch
} from './search';

/**
 * ONE SEARCH FIELD, AND THE LIST SHELL DRAWING IT
 *
 * Requirement 7 of [[efforts/832-the-interface-speaks-one-language-and-guides/spec]] and its
 * criterion 7(a): every searchable set searches with the list shell's field, its wait and `/`.
 * The field is read on its own here, and on the list shell; the contract's unit panes and the
 * settings directories are read in their own modules' tests with the same helpers.
 */

beforeEach(() => {
	loadLocale('en');
	setLocale('en');

	window.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
});

test('the field leads with the search glass', () => {
	render(SearchField);

	expect(searchGlass()).not.toBeNull();
});

test('a keystroke becomes the search only once the reader stops typing', async () => {
	const committed: string[] = [];

	render(SearchField, { onSearch: (term: string) => committed.push(term) });

	await typeSearch('nor');
	await insideTheWait();
	expect(committed).toEqual([]);

	await typeSearch('north');
	await pastTheWait();
	// the wait restarts on every keystroke, so the two keystrokes are one search.
	expect(committed).toEqual(['north']);
});

test('the search key puts the cursor in the field', async () => {
	render(SearchField);

	await pressSearchKey();

	expect(document.activeElement).toBe(searchField());
});

test('a search changed from outside is shown in the field', async () => {
	const { rerender } = render(SearchField, { value: 'north' });

	expect(searchField().value).toBe('north');

	await rerender({ value: '' });

	expect(searchField().value).toBe('');
});

test('the list shell draws the shared field, glass first', () => {
	render(ListSearchHarness);

	expect(searchGlass()).not.toBeNull();
});

test("the list shell's search waits for the reader to stop typing", async () => {
	render(ListSearchHarness);
	const committed = () => document.querySelector('[data-committed-search]')?.textContent;

	await typeSearch('one');
	await insideTheWait();
	expect(committed()).toBe('');

	await pastTheWait();
	expect(committed()).toBe('one');
});

test("the search key puts the cursor in the list shell's field", async () => {
	render(ListSearchHarness);

	await pressSearchKey();

	expect(document.activeElement).toBe(searchField());
});
