import { invoke } from '@tauri-apps/api/core';
import { openUrl as openExternalUrl } from '@tauri-apps/plugin-opener';
import { check, type DownloadEvent, type Update as TauriUpdate } from '@tauri-apps/plugin-updater';

export type Settings = {
	endingSoonNoticeDays: number;
	activeDatabasePath: string | null;
	defaultDatabasePath: string;
	locale: string | null;
	version: string;
};

export type SettingsChangeset = {
	endingSoonNoticeDays?: number;
	databasePath?: string;
	locale?: string;
};

export type BackupEntry = {
	filename: string;
	isProtected: boolean;
	createdAt: number;
	version: string;
};

export type Recovery = {
	targetVersion: string;
	backupVersion: string;
	backupFilename: string;
	updateError: string | null;
	status: 'pending' | 'applied' | 'obsolete';
	backupReleaseUrl: string;
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
	bootstrap: () => invoke<Recovery>('bootstrap'),
	window: {
		show: () => invoke<void>('window_show'),
		minimize: () => invoke<void>('window_minimize'),
		maximize: () => invoke<void>('window_maximize'),
		drag: () => invoke<void>('window_drag'),
		close: () => invoke<void>('window_close'),
		restart: () => invoke<void>('window_restart')
	},
	opener: {
		openUrl: (url: string) => openExternalUrl(url)
	},
	update: {
		prepare: (targetVersion: string) => invoke<Recovery>('update_prepare', { targetVersion }),
		check: async () => {
			const update = await check();

			return update ? mapUpdate(update) : null;
		}
	},
	settings: {
		get: () => invoke<Settings>('settings_get'),
		set: (changeset: SettingsChangeset) => invoke<Settings>('settings_set', { changeset })
	},
	backup: {
		list: () => invoke<BackupEntry[]>('backup_list'),
		create: () => invoke<BackupEntry>('backup_create'),
		delete: (filename: string) => invoke<void>('backup_delete', { filename }),
		restore: (filename: string) => invoke<void>('backup_restore', { filename })
	}
};
