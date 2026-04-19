import { invoke } from '@tauri-apps/api/core';
import { openUrl as openExternalUrl } from '@tauri-apps/plugin-opener';
import { check, type DownloadEvent, type Update as TauriUpdate } from '@tauri-apps/plugin-updater';

export type Settings = {
	endingSoonNoticeDays: number;
	databasePath: string;
	locale: string | null;
	version: string;
};

export type SettingsChangeset = {
	endingSoonNoticeDays?: number;
	locale?: string;
};

export type BackupEntry = {
	filename: string;
	isProtected: boolean;
	createdAt: number;
	version: string;
	source: 'manual' | 'autosave' | 'recovery';
	recoveryKind?: 'sync' | 'update' | null;
};

export type RemoteSyncProvider = 'local' | 'googleDrive';

export type RemoteSyncAccountStatus = 'pending' | 'ready' | 'needsReconnect';

export type RemoteSyncAccount = {
	id: string;
	provider: RemoteSyncProvider;
	status: RemoteSyncAccountStatus;
	email: string;
	displayName: string;
	avatarUrl: string | null;
	providerUserId: string | null;
	driveQuotaBytes: number | null;
	driveUsageBytes: number | null;
	appUsageBytes: number | null;
	tokenExpiresAt: number | null;
	refreshTokenAvailable: boolean;
	lastSyncedAt: number | null;
	lastError: string | null;
	createdAt: number;
	updatedAt: number;
};

export type RemoteSyncWorkspace = {
	id: string;
	accountId: string | null;
	provider: RemoteSyncProvider;
	name: string;
	localDatabasePath: string;
	remoteFolderId: string | null;
	remoteManifestFileId: string | null;
	remoteHeadFileId: string | null;
	remoteHeadRevision: string | null;
	lastRemoteUpdatedAt: number | null;
	lastSyncedAt: number | null;
	lastSnapshotAt: number | null;
	lastSnapshotFilename: string | null;
	lastError: string | null;
	createdAt: number;
	updatedAt: number;
};

export type RemoteSyncProfile = RemoteSyncWorkspace;

export type RemoteSyncState = {
	accounts: RemoteSyncAccount[];
	workspace: RemoteSyncWorkspace;
	startupPromptEnabled: boolean;
	googleDriveReady: boolean;
	deviceId: string;
};

export type GoogleDriveLinkSessionStatus = 'pending' | 'completed' | 'error' | 'cancelled';

export type GoogleDriveConfig = {
	clientId: string | null;
	clientSecret: string | null;
	authorizeEndpoint: string;
	tokenEndpoint: string;
	driveApiBaseUrl: string;
	scopes: string[];
};

export type GoogleDriveLinkSessionStart = {
	sessionId: string;
	redirectUri: string;
};

export type GoogleDriveLinkSessionResult = {
	sessionId: string;
	status: GoogleDriveLinkSessionStatus;
	authorizationCode: string | null;
	state: string | null;
	error: string | null;
};

export type GoogleDriveLinkCompleteInput = {
	email: string;
	displayName: string;
	avatarUrl?: string | null;
	providerUserId?: string | null;
	driveQuotaBytes?: number | null;
	driveUsageBytes?: number | null;
	appUsageBytes?: number | null;
	accessToken: string;
	refreshToken?: string | null;
	tokenExpiresAt?: number | null;
};

export type GoogleDriveAccountAuth = {
	accountId: string;
	accessToken: string;
	refreshToken: string;
	tokenExpiresAt: number | null;
};

export type GoogleDriveAccountUpdateInput = {
	accountId: string;
	email?: string | null;
	displayName?: string | null;
	avatarUrl?: string | null;
	providerUserId?: string | null;
	driveQuotaBytes?: number | null;
	driveUsageBytes?: number | null;
	appUsageBytes?: number | null;
	accessToken?: string | null;
	refreshToken?: string | null;
	tokenExpiresAt?: number | null;
	status?: RemoteSyncAccountStatus | null;
	error?: string | null;
};

export type GoogleDrivePreparedPush = {
	workspaceId: string;
	accountId: string;
	filename: string;
	createdAt: number;
	source: 'manual' | 'autosave';
	appVersion: string;
	contentsBase64: string;
	contentHash: string;
};

export type GoogleDriveLocalFingerprint = {
	contentHash: string;
};

export type GoogleDriveSyncLockLease = {
	leaseId: string;
};

export type GoogleDrivePreparePushInput = {
	manual?: boolean;
};

export type GoogleDriveSyncCompleteInput = {
	workspaceId: string;
	workspaceName?: string | null;
	accountId: string;
	remoteFolderId: string;
	remoteManifestFileId: string;
	remoteHeadFileId: string;
	remoteHeadRevision: string;
	remoteUpdatedAt: number;
	driveQuotaBytes?: number | null;
	driveUsageBytes?: number | null;
	appUsageBytes?: number | null;
};

export type GoogleDriveApplyPullInput = {
	workspaceId: string;
	workspaceName?: string | null;
	accountId: string;
	filename: string;
	appVersion: string;
	contentsBase64: string;
	contentHash?: string | null;
	remoteFolderId: string;
	remoteManifestFileId: string;
	remoteHeadFileId: string;
	remoteHeadRevision: string;
	remoteUpdatedAt: number;
	driveQuotaBytes?: number | null;
	driveUsageBytes?: number | null;
	appUsageBytes?: number | null;
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
		hide: () => invoke<void>('window_hide'),
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
	},
	remoteSync: {
		getState: () => invoke<RemoteSyncState>('remote_sync_state_get'),
		snapshotNow: () => invoke<RemoteSyncState>('remote_sync_snapshot_now'),
		autosaveNow: () => invoke<RemoteSyncState>('remote_sync_autosave_now'),
		googleDrive: {
			getConfig: () => invoke<GoogleDriveConfig>('remote_sync_google_drive_config_get'),
			beginLink: (input: { state: string }) =>
				invoke<GoogleDriveLinkSessionStart>('remote_sync_google_drive_begin_link', { input }),
			getLinkResult: (input: { sessionId: string }) =>
				invoke<GoogleDriveLinkSessionResult>('remote_sync_google_drive_get_link_result', {
					input
				}),
			cancelLink: (input: { sessionId: string }) =>
				invoke<void>('remote_sync_google_drive_cancel_link', { input }),
			completeLink: (input: GoogleDriveLinkCompleteInput) =>
				invoke<RemoteSyncState>('remote_sync_google_drive_complete_link', { input }),
			getAccountAuth: (input: { accountId: string }) =>
				invoke<GoogleDriveAccountAuth>('remote_sync_google_drive_get_account_auth', {
					input
				}),
			updateAccount: (input: GoogleDriveAccountUpdateInput) =>
				invoke<RemoteSyncState>('remote_sync_google_drive_update_account', { input }),
			disconnectAccount: (input: { accountId: string }) =>
				invoke<RemoteSyncState>('remote_sync_google_drive_disconnect_account', { input }),
			acquireLock: (input: { workspaceId: string }) =>
				invoke<GoogleDriveSyncLockLease>('remote_sync_google_drive_acquire_lock', { input }),
			releaseLock: (input: { leaseId: string }) =>
				invoke<void>('remote_sync_google_drive_release_lock', { input }),
			getLocalFingerprint: () =>
				invoke<GoogleDriveLocalFingerprint>('remote_sync_google_drive_get_local_fingerprint'),
			preparePush: (input?: GoogleDrivePreparePushInput) =>
				invoke<GoogleDrivePreparedPush>('remote_sync_google_drive_prepare_push', { input }),
			markSynced: (input: GoogleDriveSyncCompleteInput) =>
				invoke<RemoteSyncState>('remote_sync_google_drive_mark_synced', { input }),
			applyPull: (input: GoogleDriveApplyPullInput) =>
				invoke<RemoteSyncState>('remote_sync_google_drive_apply_pull', { input })
		}
	}
};
