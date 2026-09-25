import { render } from '@testing-library/svelte';
import { createRawSnippet, flushSync, tick } from 'svelte';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

const host = vi.hoisted(() => ({ page: vi.fn() }));
const dialog = vi.hoisted(() => ({ saveFile: vi.fn() }));

vi.mock('$lib/platform/tauri', () => ({ tauri: { print: host, dialog } }));

import Sheet from '$lib/print/component/sheet.svelte';
import { print, printSheet, sendPage, toFileName } from '$lib/print/sheet.svelte';

/**
 * THE PRINT SHEET
 *
 * Ticket 05 of [[efforts/835-the-rent-is-receipted-scheduled-and-chased/spec]], requirement 10:
 * `print(snippet)` draws the snippet on the one sheet, hands the page to the system's dialog, and
 * is finished when the dialog is (`afterprint`), clearing the sheet then and not before.
 *
 * jsdom has no host, so its `print_page` is a stand-in recording what the sheet held at the moment
 * it was asked, and `afterprint` is dispatched by the test, as the webview would. Ticket 10 moved
 * the page from `window.print()` to the host, which writes a PDF itself (requirement 10, revised).
 */

const page = (text: string) =>
	createRawSnippet(() => ({ render: () => `<p data-page>${text}</p>` }));

/** what the sheet was drawing when the host was asked, one entry per call. */
let seen: (string | undefined)[] = [];
let answer: () => Promise<void> = () => Promise.resolve();

beforeEach(() => {
	seen = [];
	answer = () => Promise.resolve();
	host.page.mockReset();
	host.page.mockImplementation(() => {
		seen.push(document.querySelector('[data-print-sheet] [data-page]')?.textContent ?? undefined);

		return answer();
	});
});

afterEach(() => {
	vi.restoreAllMocks();
	printSheet.content = null;
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

	expect(host.page).toHaveBeenCalledExactlyOnceWith({ mode: 'print' });
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

test('a PDF is written from the page on the sheet, and is finished when the host has written it', async () => {
	sheet();

	let written: () => void = () => {};
	answer = () => new Promise<void>((resolve) => (written = resolve));

	let finished = false;
	const saving = print(page('the receipt'), { mode: 'pdf', path: 'C:/receipt.pdf' }).then(
		() => (finished = true)
	);

	await settle();

	expect(host.page).toHaveBeenCalledExactlyOnceWith({ mode: 'pdf', path: 'C:/receipt.pdf' });
	expect(seen).toEqual(['the receipt']);

	// the host may raise print events while it writes; the page stays until the file is written.
	window.dispatchEvent(new Event('afterprint'));
	await settle();
	expect(finished).toBe(false);
	expect(drawn()).toBe('the receipt');

	written();
	await saving;

	flushSync();
	expect(drawn()).toBeUndefined();
});

/** the platform the webview reports: only Windows writes a PDF with no dialog. */
const runningOn = (userAgent: string) =>
	vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent);

test('on Windows, saving as PDF asks where the file goes first, and writes it there', async () => {
	sheet();
	runningOn('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/140.0');
	dialog.saveFile.mockResolvedValueOnce('C:/receipts/receipt.pdf');

	await expect(sendPage(page('the receipt'), 'pdf', 'receipt 01K5.pdf')).resolves.toBe('saved');

	expect(dialog.saveFile).toHaveBeenCalledExactlyOnceWith('receipt 01K5.pdf');
	expect(host.page).toHaveBeenCalledExactlyOnceWith({
		mode: 'pdf',
		path: 'C:/receipts/receipt.pdf'
	});
});

test('walking away from the save dialog prints nothing and is not a failure', async () => {
	sheet();
	runningOn('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/140.0');
	dialog.saveFile.mockResolvedValueOnce(null);

	await expect(sendPage(page('the receipt'), 'pdf', 'receipt.pdf')).resolves.toBe('cancelled');

	expect(host.page).not.toHaveBeenCalled();
	expect(printSheet.content).toBeNull();
});

test('a refusal from the host rejects, for the preview to say so', async () => {
	sheet();
	answer = () => Promise.reject(new Error('the printer is gone'));

	await expect(sendPage(page('the schedule'), 'print', 'schedule.pdf')).rejects.toThrow(
		'the printer is gone'
	);
});

test('off Windows, saving as PDF goes the way paper does, through the system panel', async () => {
	sheet();
	runningOn('Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0) AppleWebKit/605.1.15');

	let finished = false;
	const saving = sendPage(page('the schedule'), 'pdf', 'schedule.pdf').then((outcome) => {
		finished = true;

		return outcome;
	});

	await settle();

	// no path is asked for that the panel would ask for again, and the page stays drawn for it.
	expect(dialog.saveFile).not.toHaveBeenCalled();
	expect(host.page).toHaveBeenCalledExactlyOnceWith({ mode: 'print' });
	expect(finished).toBe(false);
	expect(drawn()).toBe('the schedule');

	window.dispatchEvent(new Event('afterprint'));

	await expect(saving).resolves.toBe('printed');
});

test('a file name keeps nothing a save dialog would read as a folder', () => {
	expect(toFileName('schedule 12/2026\\A:1.pdf')).toBe('schedule 12-2026-A-1.pdf');
});
