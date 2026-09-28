import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import en from '$lib/i18n/en';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';

import ListEmptyHarness from './list-empty-harness.svelte';

/**
 * A SET WITH NOTHING IN IT, AND THE BAR ABOVE IT
 *
 * Ticket 33 of [[efforts/832-the-interface-speaks-one-language-and-guides/spec]], from the second
 * walk of ticket 27 and ticket 31's catalogue. A tenant with no contracts said "0 results" above
 * "no contracts yet", which says nothing here twice; and the transfer menu dropped its export to the
 * platform's disabled on an empty set, with no reason, and a locked ledger took its import out of
 * the menu altogether. Both entries now stay, refused, and say why at the control
 * ([[rules/interface]], *Guidance*, and *Export and import*).
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

const count = () => document.querySelector('[data-list-count]');

test('the bar draws no count above a set that holds nothing yet', () => {
	render(ListEmptyHarness);

	expect(document.querySelector('[data-empty]')?.getAttribute('data-empty')).toBe('nothing-yet');
	expect(count()).toBeNull();
	expect(document.body.textContent).not.toContain('0 results');
});

test('a search that matched nothing keeps its count, since it answers what was asked', () => {
	render(ListEmptyHarness, { initialSearch: 'north' });

	expect(count()?.textContent?.trim()).toBe('0 results');
});

test('a filter that matched nothing keeps its count too', () => {
	render(ListEmptyHarness, { initialFilters: { status: 'closed' } });

	expect(count()?.textContent?.trim()).toBe('0 results');
});

/** open the transfer menu and read one of its two entries. */
async function transferEntry(which: 'export' | 'import') {
	await fireEvent.click(screen.getByRole('button', { name: en.common.actions.transferData }));

	const entry = document.querySelector<HTMLElement>(`[data-transfer="${which}"]`);

	expect(entry).not.toBeNull();

	return entry!;
}

/** the reason an entry names as its description. */
const describedBy = (entry: HTMLElement) =>
	document.getElementById(entry.getAttribute('aria-describedby') ?? '')?.textContent?.trim();

test('an export on a set with nothing to write stays in the menu, refused, and says why', async () => {
	render(ListEmptyHarness, { exportable: true });

	const entry = await transferEntry('export');

	expect(entry.getAttribute('aria-disabled')).toBe('true');
	// never the platform's disabled, which would leave the reason out of reach.
	expect(entry.hasAttribute('data-disabled')).toBe(false);
	expect(describedBy(entry)).toBe(en.common.export.nothingToExport);

	await fireEvent.click(entry);

	// refused: the dialog asking which file is never drawn.
	expect(document.body.textContent).not.toContain(en.common.export.description);
});

test('an import the set cannot take stays in the menu, refused, with the reason it was handed', async () => {
	const onImport = vi.fn();

	render(ListEmptyHarness, {
		onImport,
		importUnavailable: en.contracts.payments.terminatedNotice
	});

	const entry = await transferEntry('import');

	expect(entry.getAttribute('aria-disabled')).toBe('true');
	expect(describedBy(entry)).toBe(en.contracts.payments.terminatedNotice);

	await fireEvent.click(entry);

	expect(onImport).not.toHaveBeenCalled();
});

test('an import the set can take runs', async () => {
	const onImport = vi.fn();

	render(ListEmptyHarness, { onImport });

	const entry = await transferEntry('import');

	expect(entry.getAttribute('aria-disabled')).not.toBe('true');

	await fireEvent.click(entry);

	expect(onImport).toHaveBeenCalledOnce();
});
