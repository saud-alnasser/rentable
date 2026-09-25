import { tauri } from '$lib/platform/tauri';
import { tick, type Snippet } from 'svelte';

/**
 * THE PRINT SHEET, HANDED A PAGE AND PRINTING NOTHING ELSE
 *
 * One sheet is mounted in the frame (`print/component/sheet.svelte`), outside everything the
 * application draws, and it is the only thing a printed page shows: under `@media print` every
 * region of the frame is hidden and the sheet is drawn in its place (`app.css`). Printing is
 * handing it a snippet, waiting for it to draw, and asking the host to print the window
 * (`print_page`). What is printed is the caller's to draw, so a schedule and a receipt are two
 * snippets and this knows neither.
 *
 * **To paper or to a file.** On Windows the host writes a PDF with no dialog, or opens the
 * operating system's print dialog rather than the webview's browser preview; on macOS and Linux
 * both open the system's print panel (`tauri/src/print.rs`).
 *
 * **Printed in the main window, never in a second one or an iframe.** A second window runs the
 * whole startup again against the same replica, and an iframe's print does nothing on macOS
 * ([[efforts/835-the-rent-is-receipted-scheduled-and-chased/plan]], *Printing: the approaches
 * weighed*).
 *
 * **To paper, finished on `afterprint`, not when the host answers.** The host answers once the
 * dialog is asked to open, and clearing the sheet then would print an empty page; its answer is
 * watched for a refusal only. **To a file, finished when the host answers**, which it does once the
 * file is written.
 */

/** Where a page goes: to paper, or to the PDF file at `path`. */
export type PrintRequest = { mode: 'print' } | { mode: 'pdf'; path: string };

export const printSheet = $state<{
	/** what the sheet draws while a print is open, and nothing between prints. */
	content: Snippet | null;
}>({ content: null });

/** the print still open, finished early by the next one asking. */
let finishOpen: (() => void) | null = null;

/**
 * Print `content`, and nothing else, to paper or to a PDF. Resolves once the dialog is done with
 * the page (`afterprint`) or the file is written, and rejects where the host refused.
 */
export function print(content: Snippet, request: PrintRequest = { mode: 'print' }): Promise<void> {
	finishOpen?.();

	printSheet.content = content;

	return new Promise<void>((resolve, reject) => {
		const finish = (error?: unknown) => {
			window.removeEventListener('afterprint', onAfterPrint);

			if (finishOpen === finishThis) {
				finishOpen = null;
			}

			// a later print has the sheet now, and it is not this one's to clear.
			if (printSheet.content === content) {
				printSheet.content = null;
			}

			if (error === undefined) {
				resolve();
			} else {
				reject(error);
			}
		};
		const onAfterPrint = () => finish();
		const finishThis = () => finish();

		finishOpen = finishThis;

		// a file is written by the host, which may raise print events of its own while it does, so
		// only paper listens for the dialog closing.
		if (request.mode === 'print') {
			window.addEventListener('afterprint', onAfterPrint);
		}

		void (async () => {
			try {
				// the page has to be on the sheet, in its own font, before the dialog takes a picture
				// of it.
				await tick();
				await document.fonts?.ready;

				if (finishOpen !== finishThis) {
					return;
				}

				await tauri.print.page(request);

				// a file is done when it is written; paper is done when the dialog says so.
				if (request.mode === 'pdf') {
					finishThis();
				}
			} catch (error) {
				finish(error ?? new Error('the webview refused to print'));
			}
		})();
	});
}

/**
 * Whether the host writes a PDF itself, with no dialog. Only WebView2 can (`tauri/src/print.rs`);
 * on macOS and Linux the system's print panel is how a PDF is saved.
 */
export const writesPdfSilently = () =>
	typeof navigator !== 'undefined' && /Windows/.test(navigator.userAgent);

/**
 * A page sent where the preview's reader asked: to paper, or to a PDF.
 *
 * On Windows a PDF goes to a path the reader chooses first and is written there, answering
 * `saved`. Elsewhere the system's print panel saves it, so a PDF goes the way paper does and
 * answers `printed`: asking for a path the panel would then ask for again, and clearing the page
 * before the panel has drawn it, were both wrong. `cancelled` is the reader walking away from the
 * save dialog, which is not a failure and says nothing; a refusal from the host rejects, for the
 * caller to say so in a sentence.
 *
 * **`clearScreen` runs once nothing can be cancelled any more, and before anything prints**: the
 * caller closes its preview there and waits for it to be gone. While a page prints, the webview
 * lays the whole window out for paper, where every region but the sheet is taken off, and puts it
 * back after; a panel still open is taken off and put back each time, and its entry animation
 * plays again with it, so it opened and closed on screen once per pass.
 */
export async function sendPage(
	content: Snippet,
	mode: PrintRequest['mode'],
	fileName: string,
	clearScreen: () => Promise<void>
): Promise<'saved' | 'printed' | 'cancelled'> {
	if (mode === 'print' || !writesPdfSilently()) {
		await clearScreen();
		await print(content, { mode: 'print' });

		return 'printed';
	}

	const path = await tauri.dialog.saveFile(toFileName(fileName));

	if (!path) {
		return 'cancelled';
	}

	await clearScreen();
	await print(content, { mode, path });

	return 'saved';
}

/**
 * Resolves once every form surface on the page has finished animating out: what a caller that has
 * just closed its preview waits on before printing. A surface with nothing left to animate, under
 * reduced motion or already gone, resolves at once.
 */
export async function surfacesSettled(): Promise<void> {
	await tick();
	// the closing animation starts on the frame after the state flips.
	await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

	const animations = [...document.querySelectorAll('[data-slot="form-surface"]')].flatMap(
		(surface) => surface.getAnimations?.() ?? []
	);

	await Promise.all(animations.map((animation) => animation.finished.catch(() => undefined)));
}

/** A name a save dialog can open on: whatever a free-text part carried that reads as a folder. */
export const toFileName = (name: string) => name.replace(/[\\/:*?"<>|]+/g, '-').trim();
