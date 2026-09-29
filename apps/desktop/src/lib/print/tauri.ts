import { invoke } from '@tauri-apps/api/core';

import type { PrintHost } from './host';

/**
 * printing's tauri command: its port, satisfied by the Tauri shell.
 *
 * **The command name and argument shape are the Rust side's.** The command is the `print`
 * plugin's, so it is `plugin:print|<command>`; the argument is spelled as it was in the platform
 * facade, where it sat until effort 840 gave printing its own port.
 */
export const tauri = {
	/**
	 * Print what the window's print sheet holds: to paper through the operating system's
	 * dialog, or to the PDF file at `path`, which on Windows is written with no dialog at all.
	 */
	page: (
		request: ({ mode: 'print' } | { mode: 'pdf'; path: string }) & {
			page?: { head: string; lang: string; dir: string; body: string };
		}
	) => invoke<void>('plugin:print|page', request)
} satisfies PrintHost;
