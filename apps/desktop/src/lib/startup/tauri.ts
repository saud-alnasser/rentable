import { invoke } from '@tauri-apps/api/core';

import type { Recovery } from '$lib/update';

import type { StartupHost } from './host';

/**
 * startup's tauri command: its port, satisfied by the Tauri shell.
 *
 * **The command name is the Rust side's.** It is the `startup` plugin's, so it is
 * `plugin:startup|<command>`; it sat in the platform facade until effort 840 gave startup its own
 * port.
 */
export const tauri = {
	bootstrap: () => invoke<Recovery>('plugin:startup|bootstrap')
} satisfies StartupHost;
