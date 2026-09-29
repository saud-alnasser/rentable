import { invoke } from '@tauri-apps/api/core';
import { check, type Update as TauriUpdate } from '@tauri-apps/plugin-updater';

import type { AvailableUpdate, Recovery, UpdateHost } from './host';

function mapUpdate(update: TauriUpdate): AvailableUpdate {
	return {
		currentVersion: update.currentVersion,
		version: update.version,
		date: update.date ?? null,
		body: update.body ?? null,
		rawJson: update.rawJson,
		downloadAndInstall: (onEvent) => update.downloadAndInstall(onEvent),
		close: () => update.close()
	};
}

/**
 * the updater's tauri commands and plugin: its port, satisfied by the Tauri shell.
 *
 * **Every command name and argument shape is the Rust side's**, and they are spelled here exactly
 * as they were in the platform facade, where they sat until effort 840 gave the updater its own
 * port.
 */
export const tauri = {
	prepare: (targetVersion: string) => invoke<Recovery>('plugin:update|prepare', { targetVersion }),
	check: async () => {
		const update = await check();

		return update ? mapUpdate(update) : null;
	}
} satisfies UpdateHost;
