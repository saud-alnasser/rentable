import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

import type { CheckedUpdate, FetchedUpdate, Recovery, UpdateHost, UpdateProgress } from './host';

/** what the shell's download reports each chunk as (`tauri/src/update/release.rs`). */
const PROGRESS_EVENT = 'update:progress';

/**
 * the updater's tauri commands: its port, satisfied by the Tauri shell.
 *
 * **Every command name and argument shape is the Rust side's.** The commands are the `update`
 * plugin's, so each is `plugin:update|<command>` (`tauri/src/update/command.rs`). The updater
 * itself runs there since effort 857 (ticket 09): the JavaScript plugin installed only with a
 * relaunch and only from a webview still holding the download, so the window no longer calls it.
 */
export const tauri = {
	prepare: (targetVersion: string) => invoke<Recovery>('plugin:update|prepare', { targetVersion }),
	check: () => invoke<CheckedUpdate>('plugin:update|check'),
	download: async (onProgress: (progress: UpdateProgress) => void) => {
		// listening before the download starts, so its first chunk is not missed.
		const stop = await listen<UpdateProgress>(PROGRESS_EVENT, (event) => onProgress(event.payload));

		try {
			return await invoke<FetchedUpdate>('plugin:update|download');
		} finally {
			stop();
		}
	},
	install: () => invoke<void>('plugin:update|install')
} satisfies UpdateHost;
