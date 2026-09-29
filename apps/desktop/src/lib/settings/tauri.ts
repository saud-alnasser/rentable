import { invoke } from '@tauri-apps/api/core';

import type { Settings, SettingsChangeset, SettingsHost } from './host';

/**
 * settings' tauri commands: their port, satisfied by the Tauri shell.
 *
 * **Every command name and argument shape is the Rust side's.** The commands are the `settings`
 * plugin's, so each is `plugin:settings|<command>`; the arguments are spelled exactly as they were
 * in the platform facade, where they sat until effort 840 gave settings their own port.
 */
export const tauri = {
	get: () => invoke<Settings>('plugin:settings|get'),
	set: (changeset: SettingsChangeset) => invoke<Settings>('plugin:settings|set', { changeset })
} satisfies SettingsHost;
