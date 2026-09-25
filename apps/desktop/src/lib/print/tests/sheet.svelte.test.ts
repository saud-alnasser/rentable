import { render } from '@testing-library/svelte';
import { createRawSnippet, flushSync, tick } from 'svelte';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import Sheet from '$lib/print/component/sheet.svelte';
import { print, printSheet } from '$lib/print/sheet.svelte';

/**
 * THE PRINT SHEET
 *
 * Ticket 05 of [[efforts/835-the-rent-is-receipted-scheduled-and-chased/spec]], requirement 10:
 * `print(snippet)` draws the snippet on the one sheet, hands the page to the system's dialog, and
 * is finished when the dialog is (`afterprint`), clearing the sheet then and not before.
 *
 * jsdom has no print dialog, so `window.print` is a stand-in recording what the sheet held at the
 * moment it was called, and `afterprint` is dispatched by the test, as the webview would.
 */

const page = (text: string) =>
	createRawSnippet(() => ({ render: () => `<p data-page>${text}</p>` }));

/** what the sheet was drawing when the dialog was asked for, one entry per call. */
let seen: (string | undefined)[] = [];
let answer: () => unknown = () => undefined;

beforeEach(() => {
	seen = [];
	answer = () => undefined;
	vi.spyOn(window, 'print').mockImplementation(() => {
		seen.push(document.querySelector('[data-print-sheet] [data-page]')?.textContent ?? undefined);

		return answer() as undefined;
	});
});

afterEach(() => {
	printSheet.content = null;
	vi.restoreAllMocks();
	document.body.innerHTML = '';
});

const sheet = () => render(Sheet, { lang: 'en', dir: 'ltr' });
const drawn = () => document.querySelector('[data-print-sheet] [data-page]')?.textContent;

/** let the print reach the dialog: the sheet draws, and the fonts are waited on. */
async function settle() {
	for (let turn = 0; turn < 5; turn += 1) {
		flushSync();
		await tick();
	}
}

test('the sheet is hidden on screen and shown on paper, and is empty between prints', () => {
	sheet();

	const element = document.querySelector<HTMLElement>('[data-print-sheet]');

	expect(element?.classList.contains('hidden')).toBe(true);
	expect(element?.classList.contains('print:block')).toBe(true);
	expect(element?.textContent?.trim()).toBe('');
});

test('printing draws the page on the sheet, opens the dialog on it, and resolves on afterprint', async () => {
	sheet();

	let finished = false;
	const printing = print(page('the schedule')).then(() => (finished = true));

	await settle();

	expect(window.print).toHaveBeenCalledOnce();
	expect(seen).toEqual(['the schedule']);
	// the dialog is still open: the call returning is not the dialog being done.
	expect(finished).toBe(false);
	expect(drawn()).toBe('the schedule');

	window.dispatchEvent(new Event('afterprint'));
	await printing;

	expect(finished).toBe(true);
	flushSync();
	expect(drawn()).toBeUndefined();
	expect(printSheet.content).toBeNull();
});

test('a webview that refuses to print rejects, and leaves the sheet empty', async () => {
	sheet();
	answer = () => Promise.reject(new Error('not allowed'));

	await expect(print(page('the schedule'))).rejects.toThrow('not allowed');

	flushSync();
	expect(drawn()).toBeUndefined();
});

test('a print asked for while another is open finishes the first and prints the second', async () => {
	sheet();

	const first = print(page('first'));
	await settle();

	const second = print(page('second'));
	await first;
	await settle();

	expect(seen).toEqual(['first', 'second']);
	expect(drawn()).toBe('second');

	window.dispatchEvent(new Event('afterprint'));
	await second;
});
