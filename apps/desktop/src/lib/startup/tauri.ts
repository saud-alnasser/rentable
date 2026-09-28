import { invoke } from '@tauri-apps/api/core';

import type { Recovery } from '$lib/update/host';

import type { StartupHost } from './host';

/**
 * startup's tauri command: its port, satisfied by the Tauri shell.
 *
 * **The command name is the Rust side's**, spelled here exactly as it was in the platform facade,
 * where it sat until effort 840 gave startup its own port.
 */
export const tauri = {
	bootstrap: () => invoke<Recovery>('bootstrap')
} satisfies StartupHost;
