import { invoke } from '@tauri-apps/api/core';

import type { Settings, SettingsChangeset, SettingsHost } from './host';

/**
 * settings' tauri commands: their port, satisfied by the Tauri shell.
 *
 * **Every command name and argument shape is the Rust side's**, and they are spelled here exactly
 * as they were in the platform facade, where they sat until effort 840 gave settings their own
 * port.
 */
export const tauri = {
	get: () => invoke<Settings>('settings_get'),
	set: (changeset: SettingsChangeset) => invoke<Settings>('settings_set', { changeset })
} satisfies SettingsHost;
