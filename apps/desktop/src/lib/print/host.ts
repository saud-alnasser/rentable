/**
 * PRINT HOST
 *
 * what printing asks of the shell it runs in: the print capability's port. `./tauri` is its Tauri
 * adapter, and `$lib/app/host` composes it into the application's `Host` under `print`.
 *
 * Nothing in this file imports a `@tauri-apps` package, for the reason `$lib/platform/host`
 * gives: a client that is not the Tauri shell has to be able to read the port without the facade.
 */

/** what printing may ask of the shell: the page the print sheet holds, on paper or as a PDF. */
export type PrintHost = {
	/**
	 * Print what the window's print sheet holds: to paper through the operating system's dialog,
	 * or to the PDF file at `path`, written with no dialog on Windows (`tauri/src/print/`).
	 */
	page: (
		request: ({ mode: 'print' } | { mode: 'pdf'; path: string }) & {
			page?: { head: string; lang: string; dir: string; body: string };
		}
	) => Promise<void>;
};
