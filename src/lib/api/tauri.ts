import { invoke } from '@tauri-apps/api/core';

export type BackupEntry = {
	isProtected: boolean;
	name: string;
	createdAt: number;
};

export type SettingsSnapshot = {
	version: string;
	endingSoonNoticeDays: number;
	currentDatabasePath: string;
	defaultDatabasePath: string;
	usingDefaultDatabasePath: boolean;
	lastSyncAt: number | null;
	lastBackupAt: number | null;
	backups: BackupEntry[];
};

/**
 * any tauri commands that are available to the API.
 */
export const tauri = {
	example: {
		greet: (name: string) => invoke<string>('greet', { name })
	},
	window: {
		show: () => invoke<void>('window_show'),
		minimize: () => invoke<void>('window_minimize'),
		toggleMaximize: () => invoke<void>('window_toggle_maximize'),
		startDragging: () => invoke<void>('window_start_dragging'),
		close: () => invoke<void>('window_close')
	},
	db: {
		exists: () => invoke<boolean>('db_does_exist'),
		ready: () => invoke<boolean>('db_is_ready'),
		connect: () => invoke<void>('db_connect'),
		disconnect: () => invoke<void>('db_disconnect'),
		purge: () => invoke<void>('db_purge')
	},
	settings: {
		get: () => invoke<SettingsSnapshot>('settings_get'),
		setEndingSoonNoticeDays: (days: number) =>
			invoke<SettingsSnapshot>('settings_set_ending_soon_notice_days', { days }),
		setDatabasePath: (path?: string) =>
			invoke<SettingsSnapshot>('settings_set_database_path', { path: path ?? null }),
		resetDatabasePath: () => invoke<SettingsSnapshot>('settings_reset_database_path'),
		createBackup: () => invoke<SettingsSnapshot>('settings_create_backup'),
		deleteBackup: (name: string) => invoke<SettingsSnapshot>('settings_delete_backup', { name }),
		restoreBackup: (name: string) => invoke<SettingsSnapshot>('settings_restore_backup', { name }),
		markSynced: (timestamp?: number) =>
			invoke<SettingsSnapshot>('settings_mark_synced', { timestamp: timestamp ?? null })
	}
};
