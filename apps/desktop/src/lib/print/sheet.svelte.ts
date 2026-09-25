import { tick, type Snippet } from 'svelte';

/**
 * THE PRINT SHEET, HANDED A PAGE AND PRINTING NOTHING ELSE
 *
 * One sheet is mounted in the frame (`print/component/sheet.svelte`), outside everything the
 * application draws, and it is the only thing a printed page shows: under `@media print` every
 * region of the frame is hidden and the sheet is drawn in its place (`app.css`). Printing is
 * handing it a snippet, waiting for it to draw, and calling `window.print()`. What is printed is
 * the caller's to draw, so a schedule and a receipt are two snippets and this knows neither.
 *
 * **Printed in the main window, never in a second one or an iframe.** A second window runs the
 * whole startup again against the same replica, and an iframe's print does nothing on macOS
 * ([[efforts/835-the-rent-is-receipted-scheduled-and-chased/plan]], *Printing: the approaches
 * weighed*).
 *
 * **Finished on `afterprint`, not when `window.print()` returns.** Where the dialog does not hold
 * the call open, clearing the sheet on return would print an empty page. On macOS Tauri replaces
 * `window.print` with a call to the webview's own print, which answers with a promise; that
 * promise is watched for a refusal only, since it may settle before the dialog closes.
 */

export const printSheet = $state<{
	/** what the sheet draws while a print is open, and nothing between prints. */
	content: Snippet | null;
}>({ content: null });

/** the print still open, finished early by the next one asking. */
let finishOpen: (() => void) | null = null;

const isThenable = (value: unknown): value is PromiseLike<unknown> =>
	typeof (value as PromiseLike<unknown> | undefined)?.then === 'function';

/**
 * Print `content`, and nothing else, through the system's print dialog. Resolves once the dialog
 * is done with the page (`afterprint`), and rejects where the webview refused to print.
 */
export function print(content: Snippet): Promise<void> {
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
		window.addEventListener('afterprint', onAfterPrint);

		void (async () => {
			try {
				// the page has to be on the sheet, in its own font, before the dialog takes a picture
				// of it.
				await tick();
				await document.fonts?.ready;

				if (finishOpen !== finishThis) {
					return;
				}

				const opened: unknown = window.print();

				if (isThenable(opened)) {
					await opened;
				}
			} catch (error) {
				finish(error ?? new Error('the webview refused to print'));
			}
		})();
	});
}
