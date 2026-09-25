import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { placeholderStrings as strings } from '$lib/design/tests/strings';
import en from '$lib/i18n/en';
import type { Locales } from '$lib/i18n/i18n-types';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import QueryProviders from '#tests/query-providers.svelte';
import PrintPreview from '$lib/print/component/preview.svelte';

/**
 * A PAGE SHOWN BEFORE IT IS PRINTED
 *
 * Ticket 11 of [[efforts/835-the-rent-is-receipted-scheduled-and-chased/spec]], requirement 10 and
 * criterion 10(a), as revised on 2026-09-25: the print act opens a preview in the application's own
 * surface, on the language it was given, and switching the language redraws the page in the
 * other. *Save as PDF* and *print* are the preview's two acts.
 */

// the page names the language it was drawn in, and redraws when that changes, as a real page does.
const page = createRawSnippet((locale: () => Locales) => ({
	render: () => '<p data-page></p>',
	setup: (node) => {
		$effect(() => {
			node.textContent = locale();
		});
	}
}));

beforeEach(() => {
	// the page is scaled to the panel's measured width, which jsdom does not measure.
	window.ResizeObserver ??= class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
	loadLocale('en');
	setLocale('en');
});

afterEach(() => {
	document.body.innerHTML = '';
});

function opened(locale: Locales = 'en') {
	const onSave = vi.fn();
	const onPrint = vi.fn();

	render(
		PrintPreview,
		{ open: true, onOpenChange: () => {}, title: 'print receipt', locale, page, onSave, onPrint },
		{ wrapper: QueryProviders, wrapperProps: { strings, direction: 'ltr' } }
	);

	return { onSave, onPrint };
}

const drawn = () => document.querySelector('[data-print-preview] [data-page]')?.textContent;
const language = (locale: Locales) =>
	document.querySelector<HTMLElement>(`[data-print-language] [data-locale="${locale}"]`)!;

test('the preview opens on the language it was given, with the page drawn as paper', async () => {
	opened('ar');

	await waitFor(() => expect(drawn()).toBe('ar'));
	expect(document.querySelector('[data-print-preview] .paper')).not.toBeNull();
	expect(language('ar').getAttribute('aria-checked') ?? language('ar').dataset.state).toMatch(
		/true|on/
	);
});

test('choosing the other language redraws the page in it', async () => {
	opened('en');

	await waitFor(() => expect(drawn()).toBe('en'));
	await fireEvent.click(language('ar'));

	await waitFor(() => expect(drawn()).toBe('ar'));
});

test('save as PDF and print are the two acts, print being the primary one', async () => {
	const { onSave, onPrint } = opened();

	const save = await waitFor(() => document.querySelector<HTMLElement>('[data-print-save]')!);
	const paper = document.querySelector<HTMLButtonElement>('[data-print-paper]')!;

	expect(save.textContent?.trim()).toBe(en.print.save);
	expect(paper.textContent?.trim()).toBe(en.print.print);
	expect(paper.type).toBe('submit');

	await fireEvent.click(save);
	expect(onSave).toHaveBeenCalledOnce();

	await fireEvent.submit(paper.form!);
	expect(onPrint).toHaveBeenCalledOnce();
});
