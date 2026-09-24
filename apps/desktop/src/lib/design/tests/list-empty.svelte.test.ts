import { render, screen, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import en from '$lib/i18n/en';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';

import ListEmptyHarness from './list-empty-harness.svelte';

/**
 * AN EMPTY LIST LEADS, AND NEVER READS LIKE A SEARCH THAT FOUND NOTHING
 *
 * Requirement 13 of [[efforts/832-the-interface-speaks-one-language-and-guides/spec]] and its
 * criterion 13: a list with nothing in it says what it will hold and offers its create; a search
 * or a filter with no match says so and offers to clear it; and their words differ.
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

afterEach(() => {
	document.body.innerHTML = '';
});

const empty = () => document.querySelector<HTMLElement>('[data-empty]');

test('a list with nothing in it says what it will hold, in the concept’s words', () => {
	render(ListEmptyHarness);

	expect(empty()?.dataset.empty).toBe('nothing-yet');
	expect(empty()?.textContent).toContain('no tenants yet');
	expect(empty()?.textContent).toContain('tenants you add will be listed here.');
	expect(empty()?.textContent).not.toContain(en.common.messages.noMatch);
});

test('a list with nothing in it offers its create, which asks the host', () => {
	const onCreate = vi.fn();

	render(ListEmptyHarness, { onCreate });

	// the toolbar's control carries the same words, so the one read here is the empty state's own.
	const create = within(empty()!).getByRole('button', { name: en.common.actions.newRecord });

	create.click();

	expect(onCreate).toHaveBeenCalledOnce();
});

test('a list nothing may be added to offers no create in its empty state', () => {
	render(ListEmptyHarness);

	expect(empty()?.querySelector('button')).toBeNull();
});

test('a search with no match says so, not what the list will hold', () => {
	render(ListEmptyHarness, { initialSearch: 'north', onCreate: () => {} });

	expect(empty()?.dataset.empty).toBe('no-match');
	expect(empty()?.textContent).toContain(en.common.messages.noMatch);
	expect(empty()?.textContent).not.toContain('no tenants yet');
	// the create belongs to a list with nothing in it; here the way out is the clear.
	expect(empty()?.querySelector('button')?.textContent?.trim()).toBe(en.common.actions.clearSearch);
});

test('clearing a search that matched nothing puts the search down', async () => {
	render(ListEmptyHarness, { initialSearch: 'north' });

	screen.getByRole('button', { name: en.common.actions.clearSearch }).click();
	await tick();

	expect(document.querySelector('[data-search]')?.textContent).toBe('');
	expect(empty()?.dataset.empty).toBe('nothing-yet');
});

test('a filter with no match offers to clear the filter, and clearing it puts it down', async () => {
	render(ListEmptyHarness, { initialFilters: { status: 'closed' } });

	expect(empty()?.dataset.empty).toBe('no-match');

	screen.getByRole('button', { name: en.common.actions.clearFilters }).click();
	await tick();

	expect(document.querySelector('[data-filters]')?.textContent).toBe('{}');
	expect(empty()?.dataset.empty).toBe('nothing-yet');
});

test('a search and a filter together are cleared together', async () => {
	render(ListEmptyHarness, { initialSearch: 'north', initialFilters: { status: 'closed' } });

	screen.getByRole('button', { name: en.common.actions.clearSearchAndFilters }).click();
	await tick();

	expect(document.querySelector('[data-search]')?.textContent).toBe('');
	expect(document.querySelector('[data-filters]')?.textContent).toBe('{}');
});

test('the two states never read the same', () => {
	expect(en.common.messages.noMatch).not.toBe(en.tenants.empty.title);
	expect(en.common.messages.noMatch).not.toBe(en.contracts.empty.title);
	expect(en.common.messages.noMatch).not.toBe(en.complexes.empty.title);
});
