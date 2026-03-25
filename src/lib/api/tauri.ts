import { invoke } from '@tauri-apps/api/core';
import { openUrl as openExternalUrl } from '@tauri-apps/plugin-opener';
import { check, type DownloadEvent, Update as TauriUpdate } from '@tauri-apps/plugin-updater';

export type BackupEntry = {
	isProtected: boolean;
	name: string;
	createdAt: number;
};

export type UpdateRecoveryStatus = 'pending' | 'rolledBack';

export type UpdateRecovery = {
	failedVersion: string;
	previousVersion: string | null;
	backupName: string;
	error: string;
	status: UpdateRecoveryStatus;
	detectedAt: number;
	previousReleaseUrl: string;
};

export type AvailableUpdate = {
	currentVersion: string;
	version: string;
	date: string | null;
	body: string | null;
	rawJson: Record<string, unknown>;
	downloadAndInstall: (onEvent?: (event: DownloadEvent) => void) => Promise<void>;
	close: () => Promise<void>;
};

export type UpdaterDownloadEvent = DownloadEvent;

export type SettingsSnapshot = {
	version: string;
	endingSoonNoticeDays: number;
	currentDatabasePath: string;
	defaultDatabasePath: string;
	usingDefaultDatabasePath: boolean;
	lastSyncAt: number | null;
	lastBackupAt: number | null;
	updateRecovery: UpdateRecovery | null;
	backups: BackupEntry[];
	locale: string | null;
};

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
 * any tauri commands that are available to the API.
 */
export const tauri = {
	window: {
		show: () => invoke<void>('window_show'),
		minimize: () => invoke<void>('window_minimize'),
		toggleMaximize: () => invoke<void>('window_toggle_maximize'),
		startDragging: () => invoke<void>('window_start_dragging'),
		close: () => invoke<void>('window_close'),
		restart: () => invoke<void>('window_restart')
	},
	opener: {
		openUrl: (url: string) => openExternalUrl(url)
	},
	updater: {
		check: async () => {
			const update = await check();

			return update ? mapUpdate(update) : null;
		}
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
		proceedFailedUpdate: () => invoke<SettingsSnapshot>('settings_proceed_failed_update'),
		rollbackFailedUpdate: () => invoke<SettingsSnapshot>('settings_rollback_failed_update'),
		markSynced: (timestamp?: number) =>
			invoke<SettingsSnapshot>('settings_mark_synced', { timestamp: timestamp ?? null }),
		setLocale: (locale: string) => invoke<SettingsSnapshot>('settings_set_locale', { locale })
	}
};
