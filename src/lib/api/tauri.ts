import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
	openUrl as openExternalUrl,
	revealItemInDir as revealInFileManager
} from '@tauri-apps/plugin-opener';
import { check, type DownloadEvent, type Update as TauriUpdate } from '@tauri-apps/plugin-updater';

export type Settings = {
	endingSoonNoticeDays: number;
	databasePath: string;
	diagnosticsDir: string;
	locale: string | null;
	version: string;
};

export type DiagnosticRecord = {
	level: 'info' | 'warn' | 'error';
	event: string;
	fields: Record<string, string>;
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
	authorizationUrl: string;
};

export type GoogleDriveLinkSessionResult = {
	sessionId: string;
	status: GoogleDriveLinkSessionStatus;
	error: string | null;
};

/**
 * an access token for the drive calls still made from here. the refresh
 * happens in rust, so this path never carries a refresh token — other commands
 * on this surface still do, until #118 withdraws them.
 */
export type GoogleDriveAccessToken = {
	accessToken: string;
};

export type GoogleDriveLinkCompleteInput = {
	sessionId: string;
	email: string;
	displayName: string;
	avatarUrl?: string | null;
	providerUserId?: string | null;
	driveQuotaBytes?: number | null;
	driveUsageBytes?: number | null;
	appUsageBytes?: number | null;
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

export type GoogleDriveConflictKind = 'link' | 'sync' | 'corrupt' | 'relink';

/** which side of a conflict the user chose. */
export type GoogleDriveConflictResolution = 'local' | 'remote';

/** which way a conflict is recommended to be settled. narrower than a sync mode: "decide for me" is not an answer to a conflict. */
export type GoogleDriveRecommendedMode = 'push' | 'pull';

/** what the user is being asked, and everything the interface needs to ask it. */
export type GoogleDriveLinkConflict = {
	kind: GoogleDriveConflictKind;
	accountEmail: string;
	localSnapshotAt: number | null;
	remoteUpdatedAt: number | null;
	remoteFilename: string | null;
	/** why, where the reason is more specific than the kind's own wording. `null` leaves the interface to say it, in the user's language. */
	message: string | null;
};

/**
 * the situation on the remote, and what to do about it.
 *
 * `requiresResolution` is the whole point: false means the caller may proceed,
 * true means nothing transfers until the user has chosen.
 */
export type GoogleDriveLinkPreparation = {
	state: RemoteSyncState;
	requiresResolution: boolean;
	recommendedMode: GoogleDriveRecommendedMode;
	conflict: GoogleDriveLinkConflict | null;
};

/** what a sync run did. */
export type GoogleDriveSyncAction = 'none' | 'pushed' | 'pulled';

/**
 * what a sync run did, and what it could not do without asking.
 *
 * `preparation` is present only where the two sides could not be reconciled
 * without the user, and nothing transferred when it is.
 */
export type GoogleDriveSyncOutcome = {
	state: RemoteSyncState;
	action: GoogleDriveSyncAction;
	preparation: GoogleDriveLinkPreparation | null;
};

/** how far a link attempt has got. linking is one call, so progress arrives on an event instead of a return. */
export type GoogleDriveLinkPhase = 'authorizing' | 'finalizing';

const GOOGLE_DRIVE_LINK_PHASE_EVENT = 'rentable:google-drive-link-phase';

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
		openUrl: (url: string) => openExternalUrl(url),
		revealItemInDir: (path: string) => revealInFileManager(path)
	},
	diagnostics: {
		write: (record: DiagnosticRecord) => invoke<void>('diagnostics_write', { record })
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
			/**
			 * link this workspace to a google account, end to end. outstanding for as
			 * long as the user takes over the consent screen; rejects with a
			 * `cancelled` error where they abandon it.
			 */
			link: () => invoke<GoogleDriveLinkPreparation>('remote_sync_google_drive_link'),
			/** abandon the link that is outstanding, and undo one already recorded. */
			cancelLinkAttempt: () =>
				invoke<RemoteSyncState>('remote_sync_google_drive_cancel_link_attempt'),
			/** disconnect this workspace, keeping one current snapshot of it on this machine. */
			unlink: () => invoke<RemoteSyncState>('remote_sync_google_drive_unlink'),
			/**
			 * exchange this workspace with the account it is linked to, end to end.
			 * `manual` says the user asked, which decides what the snapshot a push
			 * sends counts as. rejects with a `busy` error where a sync is already
			 * running.
			 */
			sync: (input?: { manual?: boolean }) =>
				invoke<GoogleDriveSyncOutcome>('remote_sync_google_drive_sync', { input }),
			/**
			 * ask what the remote holds for this workspace, and whether the two
			 * sides can be reconciled without the user. resolves to `null` where
			 * the workspace is not on Drive.
			 */
			inspect: () => invoke<GoogleDriveLinkPreparation | null>('remote_sync_google_drive_inspect'),
			/**
			 * settle the conflict the user was asked about, the way they chose.
			 * `local` keeps this machine's copy, `remote` keeps the remote's. The
			 * remote is read again, so answering twice settles the same way.
			 */
			resolveConflict: (input: { resolution: GoogleDriveConflictResolution }) =>
				invoke<GoogleDriveSyncOutcome>('remote_sync_google_drive_resolve_conflict', { input }),
			/** watch how far a link has got. resolves to its own removal. */
			onLinkPhase: (listener: (phase: GoogleDriveLinkPhase) => void) =>
				listen<GoogleDriveLinkPhase>(GOOGLE_DRIVE_LINK_PHASE_EVENT, (event) =>
					listener(event.payload)
				),
			getConfig: () => invoke<GoogleDriveConfig>('remote_sync_google_drive_config_get'),
			beginLink: () => invoke<GoogleDriveLinkSessionStart>('remote_sync_google_drive_begin_link'),
			getLinkResult: (input: { sessionId: string }) =>
				invoke<GoogleDriveLinkSessionResult>('remote_sync_google_drive_get_link_result', {
					input
				}),
			exchangeLinkCode: (input: { sessionId: string }) =>
				invoke<GoogleDriveAccessToken>('remote_sync_google_drive_exchange_link_code', {
					input
				}),
			ensureAccessToken: (input: { accountId: string }) =>
				invoke<GoogleDriveAccessToken>('remote_sync_google_drive_ensure_access_token', {
					input
				}),
			cancelLink: (input: { sessionId: string }) =>
				invoke<void>('remote_sync_google_drive_cancel_link', { input }),
			completeLink: (input: GoogleDriveLinkCompleteInput) =>
				invoke<RemoteSyncState>('remote_sync_google_drive_complete_link', { input }),
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
