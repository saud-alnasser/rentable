import api from '$lib/api/mod';
import {
	tauri,
	type GoogleDriveConfig,
	type GoogleDriveLinkSessionResult,
	type GoogleDriveLinkSessionStart,
	type GoogleDriveSyncLockLease,
	type RemoteSyncAccount,
	type RemoteSyncState,
	type RemoteSyncWorkspace
} from '$lib/api/tauri';
import { LL } from '$lib/i18n/i18n-svelte';
import { get } from 'svelte/store';

const GOOGLE_DRIVE_UPLOAD_FILES_URL = 'https://www.googleapis.com/upload/drive/v3/files';
const RENTABLE_ROOT_FOLDER_NAME = 'Rentable Sync';
const DRIVE_FIELDS = 'id,name,modifiedTime,version,size,md5Checksum,parents,appProperties';

export type GoogleDriveSyncMode = 'sync' | 'push' | 'pull';
type GoogleDriveSyncAction = 'none' | 'pushed' | 'pulled';

export type GoogleDriveLinkResolution = 'local' | 'remote';
export type GoogleDriveConflictKind = 'link' | 'sync' | 'corrupt' | 'relink';
type GoogleDriveSnapshotSource = 'manual' | 'autosave';

export type GoogleDriveLinkConflict = {
	kind: GoogleDriveConflictKind;
	accountEmail: string;
	localSnapshotAt: number | null;
	remoteUpdatedAt: number | null;
	remoteFilename: string | null;
	message?: string;
};

export type GoogleDriveLinkPreparation = {
	state: RemoteSyncState;
	requiresResolution: boolean;
	recommendedMode: Extract<GoogleDriveSyncMode, 'push' | 'pull'>;
	conflict: GoogleDriveLinkConflict | null;
};

export type GoogleDrivePendingLinkSession = GoogleDriveLinkSessionStart & {
	clientId: string;
	state: string;
	codeVerifier: string;
};

type DriveFile = {
	id: string;
	name: string;
	modifiedTime?: string;
	version?: string;
	size?: string;
	md5Checksum?: string;
	parents?: string[];
	appProperties?: Record<string, string>;
};

type DriveAbout = {
	storageQuota?: { limit?: string; usage?: string };
	user?: {
		displayName?: string;
		emailAddress?: string;
		photoLink?: string;
		permissionId?: string;
	};
};

type DriveStorageSummary = {
	driveQuotaBytes: number | null;
	driveUsageBytes: number | null;
	appUsageBytes: number;
};

type GoogleDriveManifestEntry = {
	fileId: string;
	filename: string;
	createdAt: number;
	source: GoogleDriveSnapshotSource;
	appVersion: string;
	revision: string;
	modifiedTime: string | null;
	sizeBytes: number | null;
	md5Checksum: string | null;
	contentHash: string | null;
};

type GoogleDriveRetainedSnapshot = {
	file: DriveFile;
	source: GoogleDriveSnapshotSource;
};

type GoogleDriveManifestMetadata = {
	version: 1;
	provider: 'googleDrive';
	workspaceId: string;
	workspaceName: string;
	updatedAt: number;
};

type GoogleDriveManifest = {
	metadata: GoogleDriveManifestMetadata;
	entries: GoogleDriveManifestEntry[];
	head: GoogleDriveManifestEntry;
};

type GoogleDriveManifestCorruption = {
	message: string;
};

type GoogleDriveManifestResolution = {
	file: DriveFile;
	manifest: GoogleDriveManifest | null;
	corruption: GoogleDriveManifestCorruption | null;
};

type GoogleDriveResolvedHead = {
	file: DriveFile;
	contentHash: string | null;
	changedFromManifest: boolean;
};

type GoogleDriveSyncResolution = {
	action: GoogleDriveSyncAction;
	requiresResolution: boolean;
	recommendedMode: Extract<GoogleDriveSyncMode, 'push' | 'pull'>;
	conflictKind: GoogleDriveConflictKind | null;
	shouldMarkSyncedWithoutPull: boolean;
	shouldRefreshManifestHead: boolean;
	remoteHead: GoogleDriveResolvedHead | null;
};

type GoogleDriveRemoteEnvironment = {
	folder: DriveFile | null;
	manifest: GoogleDriveManifestResolution | null;
	shouldBootstrapWithAutosave: boolean;
};

type GoogleDriveLinkSessionOptions = {
	signal?: AbortSignal;
	onResult?: (result: GoogleDriveLinkSessionResult) => void;
};

export type GoogleDriveSyncResult = {
	state: RemoteSyncState;
	action: GoogleDriveSyncAction;
};

let googleDriveOperationQueue: Promise<void> = Promise.resolve();

type GoogleDriveResolvableConflictKind = Exclude<GoogleDriveConflictKind, 'corrupt' | 'relink'>;

class GoogleDriveStaleRemoteStateError extends Error {}

export class GoogleDriveLinkCancelledError extends Error {
	constructor() {
		super(toMessage(getGoogleDriveTranslations().common.actions.cancel()));
		this.name = 'GoogleDriveLinkCancelledError';
	}
}

class GoogleDriveRemoteCorruptionError extends Error {
	constructor(message = toMessage(getGoogleDriveTranslations().settings.syncCorruptDescription())) {
		super(message);
		this.name = 'GoogleDriveRemoteCorruptionError';
	}
}

class GoogleDriveRelinkRequiredError extends Error {
	remoteSnapshotFile: DriveFile | null;

	constructor(
		remoteSnapshotFile: DriveFile | null,
		message = toMessage(getGoogleDriveTranslations().settings.syncRelinkRequiredDescription())
	) {
		super(message);
		this.name = 'GoogleDriveRelinkRequiredError';
		this.remoteSnapshotFile = remoteSnapshotFile;
	}
}

class GoogleDriveResolutionRequiredError extends Error {
	constructor(kind: GoogleDriveResolvableConflictKind) {
		super(
			toMessage(
				kind === 'sync'
					? getGoogleDriveTranslations().settings.syncConflictShortDescription()
					: getGoogleDriveTranslations().settings.syncLinkConflictShortDescription()
			)
		);
		this.name = 'GoogleDriveResolutionRequiredError';
	}
}

class GoogleDriveAuthorizationExpiredError extends Error {
	constructor() {
		super(toMessage(getGoogleDriveTranslations().settings.syncReconnectDescription()));
		this.name = 'GoogleDriveAuthorizationExpiredError';
	}
}

class GoogleDriveSyncAlreadyRunningError extends Error {
	constructor() {
		super(toMessage(getGoogleDriveTranslations().settings.syncAlreadyRunningDescription()));
		this.name = 'GoogleDriveSyncAlreadyRunningError';
	}
}

function getGoogleDriveTranslations() {
	return get(LL);
}

function toMessage(value: unknown) {
	return String(value);
}

function createGoogleDriveNotLinkedError() {
	return new Error(toMessage(getGoogleDriveTranslations().settings.syncNotLinkedDescription()));
}

function createGoogleDriveStaleRemoteStateError() {
	return new GoogleDriveStaleRemoteStateError(
		toMessage(getGoogleDriveTranslations().settings.syncRemoteStateChangedDescription())
	);
}

function getGoogleDriveErrorText(error: unknown) {
	if (error instanceof Error && error.message.trim()) {
		return error.message;
	}

	if (typeof error === 'string' && error.trim()) {
		return error;
	}

	return null;
}

export function getGoogleDriveSyncErrorMessage(error: unknown) {
	return (
		getGoogleDriveErrorText(error) ??
		toMessage(getGoogleDriveTranslations().common.messages.unexpectedError())
	);
}

export function isGoogleDriveLinkCancelledError(error: unknown) {
	return error instanceof GoogleDriveLinkCancelledError;
}

export function shouldRetryGoogleDriveAutosync(error: unknown) {
	return !(
		error instanceof GoogleDriveResolutionRequiredError ||
		error instanceof GoogleDriveRemoteCorruptionError ||
		error instanceof GoogleDriveRelinkRequiredError ||
		error instanceof GoogleDriveAuthorizationExpiredError ||
		error instanceof GoogleDriveSyncAlreadyRunningError
	);
}

function enqueueGoogleDriveOperation<T>(task: () => Promise<T>) {
	const previous = googleDriveOperationQueue.catch(() => undefined);
	const result = previous.then(task);
	googleDriveOperationQueue = result.then(
		() => undefined,
		() => undefined
	);
	return result;
}

async function withGoogleDriveSyncLease<T>(workspaceId: string, task: () => Promise<T>) {
	let lease: GoogleDriveSyncLockLease;

	try {
		lease = await tauri.remoteSync.googleDrive.acquireLock({ workspaceId });
	} catch (error) {
		const message = getGoogleDriveErrorText(error);

		if (message?.startsWith('GOOGLE_DRIVE_SYNC_LOCKED:')) {
			throw new GoogleDriveSyncAlreadyRunningError();
		}

		throw error;
	}

	try {
		return await task();
	} finally {
		await releaseGoogleDriveSyncLease(lease).catch(() => undefined);
	}
}

async function releaseGoogleDriveSyncLease(lease: GoogleDriveSyncLockLease) {
	await tauri.remoteSync.googleDrive.releaseLock({ leaseId: lease.leaseId });
}

export async function prepareGoogleDriveLink(): Promise<GoogleDriveLinkPreparation> {
	const session = await startGoogleDriveLinkSession();

	try {
		return await finishGoogleDriveLinkSession(session);
	} catch (error) {
		await cancelGoogleDrivePendingLinkSession(session).catch(() => undefined);
		throw error;
	}
}

export async function inspectGoogleDriveLinkState(
	syncState: RemoteSyncState
): Promise<GoogleDriveLinkPreparation> {
	return await inspectGoogleDriveResolutionState(syncState);
}

export async function inspectGoogleDriveSyncState(
	syncState: RemoteSyncState
): Promise<GoogleDriveLinkPreparation> {
	return await inspectGoogleDriveResolutionState(syncState);
}

async function inspectGoogleDriveResolutionState(
	syncState: RemoteSyncState
): Promise<GoogleDriveLinkPreparation> {
	const target = getActiveGoogleDriveTarget(syncState);

	if (!target) {
		throw createGoogleDriveNotLinkedError();
	}

	const config = await tauri.remoteSync.googleDrive.getConfig();
	const accessToken = await ensureAccessToken(config, target.account);
	const folder = await resolveExistingWorkspaceFolder(config, accessToken, target.workspace);
	let nextState = syncState;

	try {
		const storageSummary = await loadDriveStorageSummary(config, accessToken, folder?.id ?? null);

		if (
			storageSummary.appUsageBytes !== (target.account.appUsageBytes ?? 0) ||
			storageSummary.driveQuotaBytes !== target.account.driveQuotaBytes ||
			storageSummary.driveUsageBytes !== target.account.driveUsageBytes
		) {
			nextState = await tauri.remoteSync.googleDrive.updateAccount({
				accountId: target.account.id,
				driveQuotaBytes: storageSummary.driveQuotaBytes,
				driveUsageBytes: storageSummary.driveUsageBytes,
				appUsageBytes: storageSummary.appUsageBytes
			});
		}
	} catch {
		/* keep link inspection resilient if storage metadata refresh fails */
	}

	const activeTarget = getActiveGoogleDriveTarget(nextState);

	if (!activeTarget) {
		throw createGoogleDriveNotLinkedError();
	}

	try {
		const environment = await ensureGoogleDriveRemoteEnvironment(
			config,
			accessToken,
			activeTarget.workspace
		);
		const remoteManifest = environment.manifest;
		const resolution = await analyzeRemoteSyncResolution(
			config,
			accessToken,
			activeTarget.workspace,
			remoteManifest?.manifest ?? null
		);

		return {
			state: nextState,
			requiresResolution: resolution.requiresResolution,
			recommendedMode: resolution.recommendedMode,
			conflict: resolution.conflictKind
				? createConflictState(
						activeTarget,
						remoteManifest?.manifest ?? null,
						resolution.conflictKind
					)
				: null
		};
	} catch (error) {
		if (!(error instanceof GoogleDriveRelinkRequiredError)) {
			throw error;
		}

		nextState = await tauri.remoteSync.googleDrive.updateAccount({
			accountId: activeTarget.account.id,
			error: error.message
		});

		return {
			state: nextState,
			requiresResolution: true,
			recommendedMode: 'push',
			conflict: createConflictState(activeTarget, null, 'relink', error.message, {
				remoteUpdatedAt: parseDriveTimestamp(error.remoteSnapshotFile?.modifiedTime),
				remoteFilename: error.remoteSnapshotFile?.name ?? null
			})
		};
	}
}

export async function resolveGoogleDriveLink(
	preparation: GoogleDriveLinkPreparation,
	resolution:
		| GoogleDriveLinkResolution
		| Extract<GoogleDriveSyncMode, 'push' | 'pull'> = preparation.recommendedMode
): Promise<GoogleDriveSyncResult> {
	if (!preparation.requiresResolution) {
		return await syncActiveGoogleDriveProfile('sync', preparation.state);
	}

	if (preparation.conflict?.kind === 'corrupt' && resolution !== 'local' && resolution !== 'push') {
		throw new GoogleDriveRemoteCorruptionError();
	}

	const mode = resolution === 'local' ? 'push' : resolution === 'remote' ? 'pull' : resolution;

	return await syncActiveGoogleDriveProfile(mode, preparation.state);
}

export async function cancelGoogleDriveLink(preparation: GoogleDriveLinkPreparation) {
	const target = getActiveGoogleDriveTarget(preparation.state);

	if (!target) {
		return preparation.state;
	}

	const nextState = await disconnectGoogleDriveAccount(target.account.id);
	await api.app.state.sync();

	return nextState;
}

export async function startGoogleDriveLinkSession(): Promise<GoogleDrivePendingLinkSession> {
	const config = await tauri.remoteSync.googleDrive.getConfig();
	const clientId = config.clientId?.trim();

	if (!clientId) {
		throw new Error(toMessage(getGoogleDriveTranslations().settings.syncGoogleDrivePending()));
	}

	const state = randomToken();
	const codeVerifier = randomToken();
	const codeChallenge = await createPkceChallenge(codeVerifier);
	const session = await tauri.remoteSync.googleDrive.beginLink({ state });
	const authorizationUrl = buildAuthorizationUrl(
		config,
		clientId,
		session.redirectUri,
		state,
		codeChallenge
	);

	try {
		await tauri.opener.openUrl(authorizationUrl);
	} catch (error) {
		await tauri.remoteSync.googleDrive
			.cancelLink({ sessionId: session.sessionId })
			.catch(() => undefined);
		throw error;
	}

	return {
		...session,
		clientId,
		state,
		codeVerifier
	};
}

export async function finishGoogleDriveLinkSession(
	session: GoogleDrivePendingLinkSession,
	options?: GoogleDriveLinkSessionOptions
): Promise<GoogleDriveLinkPreparation> {
	const config = await tauri.remoteSync.googleDrive.getConfig();
	const linkedState = await linkGoogleDriveAccount(session, config, options);
	return await inspectGoogleDriveLinkState(linkedState);
}

export async function cancelGoogleDrivePendingLinkSession(
	session: Pick<GoogleDrivePendingLinkSession, 'sessionId'>
) {
	await tauri.remoteSync.googleDrive.cancelLink({ sessionId: session.sessionId });
}

async function linkGoogleDriveAccount(
	session: GoogleDrivePendingLinkSession,
	config: GoogleDriveConfig,
	options?: GoogleDriveLinkSessionOptions
): Promise<RemoteSyncState> {
	const result = await waitForLinkResult(session.sessionId, options);
	throwIfGoogleDriveLinkCancelled(options?.signal);

	if (result.status !== 'completed' || !result.authorizationCode) {
		if (result.status === 'cancelled') {
			throw new GoogleDriveLinkCancelledError();
		}

		if (result.error === 'access_denied') {
			throw new GoogleDriveLinkCancelledError();
		}

		if (result.error === 'GOOGLE_DRIVE_LINK_TIMED_OUT') {
			throw new Error(
				toMessage(getGoogleDriveTranslations().settings.syncLinkTimedOutDescription())
			);
		}

		throw new Error(
			result.error ?? toMessage(getGoogleDriveTranslations().common.messages.unexpectedError())
		);
	}

	const tokens = await exchangeAuthorizationCode(config, {
		clientId: session.clientId,
		redirectUri: session.redirectUri,
		codeVerifier: session.codeVerifier,
		code: result.authorizationCode
	});
	const about = await fetchGoogleDriveAbout(config, tokens.accessToken);
	throwIfGoogleDriveLinkCancelled(options?.signal);

	return tauri.remoteSync.googleDrive.completeLink({
		email: about.user?.emailAddress?.trim() || '',
		displayName: about.user?.displayName?.trim() || about.user?.emailAddress?.trim() || '',
		avatarUrl: about.user?.photoLink ?? null,
		providerUserId: about.user?.permissionId ?? null,
		driveQuotaBytes: parseDriveNumber(about.storageQuota?.limit),
		driveUsageBytes: parseDriveNumber(about.storageQuota?.usage),
		appUsageBytes: 0,
		accessToken: tokens.accessToken,
		refreshToken: tokens.refreshToken,
		tokenExpiresAt: tokens.expiresAt
	});
}

function throwIfGoogleDriveLinkCancelled(signal?: AbortSignal) {
	if (signal?.aborted) {
		throw new GoogleDriveLinkCancelledError();
	}
}

export async function disconnectGoogleDriveAccount(accountId: string): Promise<RemoteSyncState> {
	return tauri.remoteSync.googleDrive.disconnectAccount({ accountId });
}

export async function unlinkActiveGoogleDriveWorkspace(
	providedState?: RemoteSyncState | null
): Promise<RemoteSyncState> {
	return await enqueueGoogleDriveOperation(async () => {
		await api.app.state.sync();

		const syncState = providedState ?? (await tauri.remoteSync.getState());
		const target = getActiveGoogleDriveTarget(syncState);

		if (!target) {
			throw createGoogleDriveNotLinkedError();
		}

		return await withGoogleDriveSyncLease(target.workspace.id, async () => {
			const snapshotState = await tauri.remoteSync.autosaveNow();
			await keepSingleFreshAutosaveSnapshot(snapshotState);

			const nextState = await disconnectGoogleDriveAccount(target.account.id);
			await api.app.state.sync();

			return nextState;
		});
	});
}

export async function resetBrokenGoogleDriveWorkspace(
	providedState?: RemoteSyncState | null
): Promise<RemoteSyncState> {
	return await enqueueGoogleDriveOperation(async () => {
		await api.app.state.sync();

		const syncState = providedState ?? (await tauri.remoteSync.getState());
		const target = getActiveGoogleDriveTarget(syncState);

		if (!target) {
			throw createGoogleDriveNotLinkedError();
		}

		return await withGoogleDriveSyncLease(target.workspace.id, async () => {
			const snapshotState = await tauri.remoteSync.autosaveNow();
			await keepSingleFreshAutosaveSnapshot(snapshotState);

			const refreshedState = await tauri.remoteSync.getState();
			const refreshedTarget = getActiveGoogleDriveTarget(refreshedState);

			if (!refreshedTarget) {
				throw createGoogleDriveNotLinkedError();
			}

			const config = await tauri.remoteSync.googleDrive.getConfig();
			const accessToken = await ensureAccessToken(config, refreshedTarget.account);
			const folder = await resolveExistingWorkspaceFolder(
				config,
				accessToken,
				refreshedTarget.workspace
			);

			if (folder) {
				await purgeWorkspaceFolderContents(config, accessToken, folder.id);
			}

			const nextState = await disconnectGoogleDriveAccount(refreshedTarget.account.id);
			await api.app.state.sync();

			return nextState;
		});
	});
}

export async function syncBeforeAppExit(providedState?: RemoteSyncState | null) {
	await api.app.state.sync();

	const syncState = providedState ?? (await tauri.remoteSync.getState());
	const target = getActiveGoogleDriveTarget(syncState);

	if (target) {
		const inspection = await inspectGoogleDriveSyncState(syncState);
		if (inspection.requiresResolution) {
			return { state: inspection.state, action: 'none' as const };
		}
	}

	return await syncActiveGoogleDriveProfile('sync', syncState);
}

export async function syncActiveGoogleDriveProfile(
	mode: GoogleDriveSyncMode = 'sync',
	providedState?: RemoteSyncState | null,
	options?: { manual?: boolean }
): Promise<GoogleDriveSyncResult> {
	return await enqueueGoogleDriveOperation(async () => {
		const syncState = providedState ?? (await tauri.remoteSync.getState());
		const target = getActiveGoogleDriveTarget(syncState);

		if (!target || !syncState.googleDriveReady) {
			return { state: syncState, action: 'none' };
		}

		return await withGoogleDriveSyncLease(target.workspace.id, async () => {
			return await syncActiveGoogleDriveProfileUnlocked(mode, syncState, options, 0);
		});
	});
}

async function syncActiveGoogleDriveProfileUnlocked(
	mode: GoogleDriveSyncMode,
	syncState: RemoteSyncState,
	options: { manual?: boolean } | undefined,
	retryCount: number
): Promise<GoogleDriveSyncResult> {
	const target = getActiveGoogleDriveTarget(syncState);

	if (!target || !syncState.googleDriveReady) {
		return { state: syncState, action: 'none' };
	}

	const { account } = target;
	const config = await tauri.remoteSync.googleDrive.getConfig();
	const accessToken = await ensureAccessToken(config, account);
	const about = await fetchGoogleDriveAbout(config, accessToken);
	let currentState = await tauri.remoteSync.googleDrive.updateAccount({
		accountId: account.id,
		email: about.user?.emailAddress ?? account.email,
		displayName: about.user?.displayName ?? account.displayName,
		avatarUrl: about.user?.photoLink ?? account.avatarUrl,
		providerUserId: about.user?.permissionId ?? account.providerUserId,
		driveQuotaBytes: parseDriveNumber(about.storageQuota?.limit),
		driveUsageBytes: parseDriveNumber(about.storageQuota?.usage),
		status: 'ready',
		error: null
	});

	const refreshedTarget = getActiveGoogleDriveTarget(currentState);
	if (!refreshedTarget) {
		return { state: currentState, action: 'none' };
	}

	const activeWorkspace = refreshedTarget.workspace;
	const activeAccount = refreshedTarget.account;
	let environment: GoogleDriveRemoteEnvironment;

	try {
		environment = await ensureGoogleDriveRemoteEnvironment(config, accessToken, activeWorkspace);
	} catch (error) {
		if (!(error instanceof GoogleDriveRelinkRequiredError)) {
			throw error;
		}

		currentState = await tauri.remoteSync.googleDrive.updateAccount({
			accountId: activeAccount.id,
			error: error.message
		});
		throw error;
	}

	const folder = environment.folder;
	const remoteManifest = environment.manifest;
	const shouldBootstrapWithAutosave = environment.shouldBootstrapWithAutosave;

	if (remoteManifest?.corruption) {
		currentState = await tauri.remoteSync.googleDrive.updateAccount({
			accountId: activeAccount.id,
			error: remoteManifest.corruption.message
		});

		if (mode !== 'push') {
			throw new GoogleDriveRemoteCorruptionError(remoteManifest.corruption.message);
		}
	}

	const resolution = await analyzeRemoteSyncResolution(
		config,
		accessToken,
		activeWorkspace,
		remoteManifest?.manifest ?? null,
		mode
	);

	if (resolution.requiresResolution) {
		throw new GoogleDriveResolutionRequiredError(
			resolution.conflictKind === 'sync' ? 'sync' : 'link'
		);
	}

	const action = resolution.action;

	if (action === 'none') {
		if (
			resolution.shouldRefreshManifestHead &&
			folder &&
			remoteManifest?.file &&
			remoteManifest.manifest?.head &&
			resolution.remoteHead
		) {
			currentState = await refreshRemoteManifestHead(
				config,
				accessToken,
				activeAccount,
				folder.id,
				remoteManifest.file,
				remoteManifest.manifest,
				resolution.remoteHead,
				about
			);
			return { state: currentState, action };
		}

		if (
			resolution.shouldMarkSyncedWithoutPull &&
			folder &&
			remoteManifest?.file &&
			remoteManifest.manifest?.head
		) {
			currentState = await markRemoteWorkspaceSyncedWithoutPull(
				config,
				accessToken,
				activeAccount,
				folder.id,
				remoteManifest.file.id,
				remoteManifest.manifest,
				about
			);
		}

		return { state: currentState, action };
	}

	if (action === 'pulled') {
		if (!folder || !remoteManifest?.file || !remoteManifest.manifest?.head) {
			throw new Error(
				toMessage(getGoogleDriveTranslations().settings.syncRemoteSnapshotUnavailableDescription())
			);
		}

		let manifestFileForPull = remoteManifest.file;
		let manifestForPull = remoteManifest.manifest;
		if (resolution.shouldRefreshManifestHead && resolution.remoteHead) {
			const refreshedManifest = await saveRefreshedRemoteManifestHead(
				config,
				accessToken,
				folder.id,
				remoteManifest.file,
				remoteManifest.manifest,
				resolution.remoteHead
			);
			manifestFileForPull = refreshedManifest.file;
			manifestForPull = refreshedManifest.manifest;
		}

		currentState = await pullRemoteSnapshot(
			config,
			accessToken,
			activeWorkspace,
			activeAccount,
			folder.id,
			manifestFileForPull.id,
			manifestForPull,
			about
		);
		return { state: currentState, action };
	}

	try {
		currentState = await pushLocalSnapshot(
			config,
			accessToken,
			currentState,
			activeWorkspace,
			activeAccount,
			folder,
			remoteManifest?.file ?? null,
			remoteManifest?.manifest ?? null,
			about,
			Boolean(options?.manual) && !shouldBootstrapWithAutosave
		);
		return { state: currentState, action };
	} catch (error) {
		if (!(error instanceof GoogleDriveStaleRemoteStateError) || retryCount >= 1) {
			throw error;
		}

		const refreshedState = await tauri.remoteSync.getState();
		return await syncActiveGoogleDriveProfileUnlocked(
			mode,
			refreshedState,
			options,
			retryCount + 1
		);
	}
}

function getActiveGoogleDriveTarget(syncState: RemoteSyncState) {
	const workspace = syncState.workspace;
	if (workspace.provider !== 'googleDrive' || !workspace.accountId) {
		return null;
	}

	const account = syncState.accounts.find((entry) => entry.id === workspace.accountId);
	return account ? { workspace, account } : null;
}

async function ensureGoogleDriveRemoteEnvironment(
	config: GoogleDriveConfig,
	accessToken: string,
	workspace: RemoteSyncWorkspace
): Promise<GoogleDriveRemoteEnvironment> {
	const folder = await resolveExistingWorkspaceFolder(config, accessToken, workspace);
	const manifest = folder ? await resolveManifest(config, accessToken, workspace, folder.id) : null;

	return {
		folder,
		manifest,
		shouldBootstrapWithAutosave: !folder || !manifest?.manifest?.head
	};
}

async function analyzeRemoteSyncResolution(
	config: GoogleDriveConfig,
	accessToken: string,
	workspace: RemoteSyncWorkspace,
	manifest: GoogleDriveManifest | null,
	mode: GoogleDriveSyncMode = 'sync'
): Promise<GoogleDriveSyncResolution> {
	if (mode !== 'sync' || !manifest?.head) {
		return analyzeSyncResolution(workspace, manifest, mode);
	}

	const [localContentHash, remoteHead] = await Promise.all([
		loadLocalWorkspaceContentHash(),
		resolveRemoteHeadState(config, accessToken, manifest)
	]);
	const shouldRefreshManifestHead = Boolean(
		remoteHead && shouldRefreshRemoteManifestHead(manifest.head, remoteHead)
	);

	return analyzeSyncResolution(workspace, manifest, mode, {
		localContentHash,
		remoteContentHash: remoteHead?.contentHash,
		remoteHeadRevision: remoteHead?.file.version ?? manifest.head.revision,
		remoteHeadChanged: remoteHead?.changedFromManifest ?? false,
		remoteHead,
		shouldRefreshManifestHead
	});
}

function analyzeSyncResolution(
	workspace: RemoteSyncWorkspace,
	manifest: GoogleDriveManifest | null,
	mode: GoogleDriveSyncMode = 'sync',
	contentHashes: {
		localContentHash?: string | null;
		remoteContentHash?: string | null;
		remoteHeadRevision?: string | null;
		remoteHeadChanged?: boolean;
		remoteHead?: GoogleDriveResolvedHead | null;
		shouldRefreshManifestHead?: boolean;
	} = {}
): GoogleDriveSyncResolution {
	const localContentHash = normalizeContentHash(contentHashes.localContentHash);
	const remoteContentHash = normalizeContentHash(
		contentHashes.remoteContentHash ?? manifest?.head?.contentHash ?? null
	);
	const remoteHeadRevision = contentHashes.remoteHeadRevision ?? manifest?.head?.revision ?? null;
	const remoteHeadChanged = Boolean(contentHashes.remoteHeadChanged);
	const localMatchesRemote =
		Boolean(localContentHash) &&
		Boolean(remoteContentHash) &&
		localContentHash === remoteContentHash;

	if (mode === 'push') {
		return {
			action: 'pushed' as const,
			requiresResolution: false,
			recommendedMode: 'push' as const,
			conflictKind: null,
			shouldMarkSyncedWithoutPull: false,
			shouldRefreshManifestHead: Boolean(contentHashes.shouldRefreshManifestHead),
			remoteHead: contentHashes.remoteHead ?? null
		};
	}

	if (mode === 'pull') {
		return {
			action: 'pulled' as const,
			requiresResolution: false,
			recommendedMode: 'pull' as const,
			conflictKind: null,
			shouldMarkSyncedWithoutPull: false,
			shouldRefreshManifestHead: Boolean(contentHashes.shouldRefreshManifestHead),
			remoteHead: contentHashes.remoteHead ?? null
		};
	}

	if (!manifest?.head) {
		return {
			action: 'pushed' as const,
			requiresResolution: false,
			recommendedMode: 'push' as const,
			conflictKind: null,
			shouldMarkSyncedWithoutPull: false,
			shouldRefreshManifestHead: Boolean(contentHashes.shouldRefreshManifestHead),
			remoteHead: contentHashes.remoteHead ?? null
		};
	}

	const remoteChanged =
		manifest.metadata.updatedAt > (workspace.lastRemoteUpdatedAt ?? 0) ||
		remoteHeadRevision !== (workspace.remoteHeadRevision ?? '') ||
		remoteHeadChanged;

	if (localMatchesRemote) {
		return {
			action: 'none' as const,
			requiresResolution: false,
			recommendedMode: 'pull' as const,
			conflictKind: null,
			shouldMarkSyncedWithoutPull:
				remoteChanged || !workspace.lastSyncedAt || !workspace.remoteHeadFileId,
			shouldRefreshManifestHead:
				Boolean(contentHashes.shouldRefreshManifestHead) || remoteHeadChanged,
			remoteHead: contentHashes.remoteHead ?? null
		};
	}

	const needsInitialResolution =
		hasLocalSnapshot(workspace) && !workspace.lastSyncedAt && !workspace.remoteHeadFileId;

	if (needsInitialResolution) {
		return {
			action: 'none' as const,
			requiresResolution: true,
			recommendedMode: 'push' as const,
			conflictKind: 'link' as const,
			shouldMarkSyncedWithoutPull: false,
			shouldRefreshManifestHead: Boolean(contentHashes.shouldRefreshManifestHead),
			remoteHead: contentHashes.remoteHead ?? null
		};
	}

	const lastSyncedAt = workspace.lastSyncedAt ?? 0;
	const localSnapshotAt = workspace.lastSnapshotAt ?? 0;
	const localChanged =
		localContentHash && remoteContentHash
			? localContentHash !== remoteContentHash
			: localSnapshotAt > lastSyncedAt || !workspace.remoteHeadFileId;

	if (remoteChanged && localChanged && lastSyncedAt > 0) {
		return {
			action: 'none' as const,
			requiresResolution: true,
			recommendedMode:
				localSnapshotAt >= manifest.metadata.updatedAt ? ('push' as const) : ('pull' as const),
			conflictKind: 'sync' as const,
			shouldMarkSyncedWithoutPull: false,
			shouldRefreshManifestHead: Boolean(contentHashes.shouldRefreshManifestHead),
			remoteHead: contentHashes.remoteHead ?? null
		};
	}

	return {
		action: remoteChanged
			? ('pulled' as const)
			: localChanged
				? ('pushed' as const)
				: ('none' as const),
		requiresResolution: false,
		recommendedMode: remoteChanged && !localChanged ? ('pull' as const) : ('push' as const),
		conflictKind: null,
		shouldMarkSyncedWithoutPull: false,
		shouldRefreshManifestHead: Boolean(contentHashes.shouldRefreshManifestHead),
		remoteHead: contentHashes.remoteHead ?? null
	};
}

function shouldRefreshRemoteManifestHead(
	head: GoogleDriveManifestEntry,
	remoteHead: GoogleDriveResolvedHead
) {
	if (remoteHead.changedFromManifest) {
		return true;
	}

	const manifestContentHash = normalizeContentHash(head.contentHash);
	const remoteContentHash = normalizeContentHash(remoteHead.contentHash);
	return Boolean(remoteContentHash && remoteContentHash !== manifestContentHash);
}

function hasLocalSnapshot(workspace: RemoteSyncWorkspace) {
	return Boolean(workspace.lastSnapshotAt || workspace.lastSnapshotFilename);
}

async function ensureAccessToken(config: GoogleDriveConfig, account: RemoteSyncAccount) {
	const auth = await tauri.remoteSync.googleDrive.getAccountAuth({ accountId: account.id });
	const isTokenFresh = Boolean(
		auth.accessToken && (!auth.tokenExpiresAt || auth.tokenExpiresAt > Date.now() + 60_000)
	);

	if (isTokenFresh) {
		return auth.accessToken;
	}

	if (!config.clientId?.trim() || !auth.refreshToken.trim()) {
		const message = toMessage(getGoogleDriveTranslations().settings.syncReconnectDescription());
		await tauri.remoteSync.googleDrive.updateAccount({
			accountId: account.id,
			status: 'needsReconnect',
			error: message
		});
		throw new GoogleDriveAuthorizationExpiredError();
	}

	const refreshed = await refreshAccessToken(config, config.clientId, auth.refreshToken);
	await tauri.remoteSync.googleDrive.updateAccount({
		accountId: account.id,
		accessToken: refreshed.accessToken,
		refreshToken: refreshed.refreshToken ?? null,
		tokenExpiresAt: refreshed.expiresAt,
		status: 'ready',
		error: null
	});

	return refreshed.accessToken;
}

async function pushLocalSnapshot(
	config: GoogleDriveConfig,
	accessToken: string,
	syncState: RemoteSyncState,
	workspace: RemoteSyncWorkspace,
	account: RemoteSyncAccount,
	folder: DriveFile | null,
	manifestFile: DriveFile | null,
	manifest: GoogleDriveManifest | null,
	about: DriveAbout,
	manual: boolean
) {
	const prepared = await tauri.remoteSync.googleDrive.preparePush({ manual });
	if (prepared.workspaceId !== syncState.workspace.id || prepared.accountId !== account.id) {
		throw new Error(
			toMessage(getGoogleDriveTranslations().settings.syncWorkspaceChangedDescription())
		);
	}

	const ensuredFolder = folder ?? (await ensureWorkspaceFolder(config, accessToken, workspace));
	const comparableManifestFile = manifestFile ?? null;
	const checkedManifestFile = await ensureManifestReadyForWrite(
		config,
		accessToken,
		ensuredFolder.id,
		comparableManifestFile
	);
	const remoteWorkspaceId =
		manifest?.metadata.workspaceId ??
		ensuredFolder.appProperties?.rentableWorkspaceId ??
		workspace.id;
	const remoteWorkspaceName = manifest?.metadata.workspaceName ?? workspace.name;
	const snapshotBytes = base64ToUint8Array(prepared.contentsBase64);
	const snapshotFile = await uploadFile(accessToken, {
		name: prepared.filename,
		parents: [ensuredFolder.id],
		mimeType: 'application/x-sqlite3',
		appProperties: {
			rentableType: 'snapshot',
			rentableWorkspaceId: remoteWorkspaceId,
			rentableDeviceId: syncState.deviceId,
			rentableCreatedAt: String(prepared.createdAt),
			rentableSource: prepared.source,
			rentableAppVersion: prepared.appVersion,
			...(normalizeContentHash(prepared.contentHash)
				? { rentableContentHash: normalizeContentHash(prepared.contentHash)! }
				: {})
		},
		content: snapshotBytes
	});

	const retainedSnapshots = await deleteStaleWorkspaceSnapshots(
		config,
		accessToken,
		ensuredFolder.id
	);
	const nextManifest = await buildManifestFromRemoteSnapshots(
		config,
		accessToken,
		ensuredFolder.id,
		remoteWorkspaceId,
		remoteWorkspaceName,
		snapshotFile,
		manifest,
		{
			createdAt: prepared.createdAt,
			source: prepared.source,
			appVersion: prepared.appVersion,
			contentHash: normalizeContentHash(prepared.contentHash)
		},
		retainedSnapshots
	);
	await ensureManifestReadyForWrite(config, accessToken, ensuredFolder.id, checkedManifestFile);
	const savedManifest = await saveRemoteManifestFile(
		accessToken,
		ensuredFolder.id,
		remoteWorkspaceId,
		nextManifest
	);
	await deleteStaleWorkspaceManifests(config, accessToken, ensuredFolder.id, savedManifest.id);
	const storageSummary = await loadDriveStorageSummary(
		config,
		accessToken,
		ensuredFolder.id,
		about
	);

	return tauri.remoteSync.googleDrive.markSynced({
		workspaceId: remoteWorkspaceId,
		workspaceName: remoteWorkspaceName,
		accountId: account.id,
		remoteFolderId: ensuredFolder.id,
		remoteManifestFileId: savedManifest.id,
		remoteHeadFileId: nextManifest.head.fileId,
		remoteHeadRevision: nextManifest.head.revision,
		remoteUpdatedAt: nextManifest.metadata.updatedAt,
		driveQuotaBytes: storageSummary.driveQuotaBytes,
		driveUsageBytes: storageSummary.driveUsageBytes,
		appUsageBytes: storageSummary.appUsageBytes
	});
}

async function pullRemoteSnapshot(
	config: GoogleDriveConfig,
	accessToken: string,
	workspace: RemoteSyncWorkspace,
	account: RemoteSyncAccount,
	folderId: string,
	manifestFileId: string,
	manifest: GoogleDriveManifest,
	about: DriveAbout
) {
	const bytes = await downloadDriveFile(config, accessToken, manifest.head.fileId);
	const actualContentHash = await computeContentHash(bytes);
	const expectedContentHash = normalizeContentHash(manifest.head.contentHash);

	if (expectedContentHash && actualContentHash !== expectedContentHash) {
		throw new GoogleDriveRemoteCorruptionError();
	}

	const storageSummary = await loadDriveStorageSummary(config, accessToken, folderId, about);
	const state = await tauri.remoteSync.googleDrive.applyPull({
		workspaceId: manifest.metadata.workspaceId,
		workspaceName: manifest.metadata.workspaceName,
		accountId: account.id,
		filename: manifest.head.filename,
		appVersion: manifest.head.appVersion,
		contentsBase64: uint8ArrayToBase64(bytes),
		contentHash: actualContentHash,
		remoteFolderId: folderId,
		remoteManifestFileId: manifestFileId,
		remoteHeadFileId: manifest.head.fileId,
		remoteHeadRevision: manifest.head.revision,
		remoteUpdatedAt: manifest.metadata.updatedAt,
		driveQuotaBytes: storageSummary.driveQuotaBytes,
		driveUsageBytes: storageSummary.driveUsageBytes,
		appUsageBytes: storageSummary.appUsageBytes
	});

	await api.app.state.sync();
	return state;
}

async function markRemoteWorkspaceSyncedWithoutPull(
	config: GoogleDriveConfig,
	accessToken: string,
	account: RemoteSyncAccount,
	folderId: string,
	manifestFileId: string,
	manifest: GoogleDriveManifest,
	about: DriveAbout
) {
	const storageSummary = await loadDriveStorageSummary(config, accessToken, folderId, about);

	return tauri.remoteSync.googleDrive.markSynced({
		workspaceId: manifest.metadata.workspaceId,
		workspaceName: manifest.metadata.workspaceName,
		accountId: account.id,
		remoteFolderId: folderId,
		remoteManifestFileId: manifestFileId,
		remoteHeadFileId: manifest.head.fileId,
		remoteHeadRevision: manifest.head.revision,
		remoteUpdatedAt: manifest.metadata.updatedAt,
		driveQuotaBytes: storageSummary.driveQuotaBytes,
		driveUsageBytes: storageSummary.driveUsageBytes,
		appUsageBytes: storageSummary.appUsageBytes
	});
}

async function refreshRemoteManifestHead(
	config: GoogleDriveConfig,
	accessToken: string,
	account: RemoteSyncAccount,
	folderId: string,
	manifestFile: DriveFile,
	manifest: GoogleDriveManifest,
	remoteHead: GoogleDriveResolvedHead,
	about: DriveAbout
) {
	const refreshedManifest = await saveRefreshedRemoteManifestHead(
		config,
		accessToken,
		folderId,
		manifestFile,
		manifest,
		remoteHead
	);
	await deleteStaleWorkspaceManifests(config, accessToken, folderId, refreshedManifest.file.id);
	const storageSummary = await loadDriveStorageSummary(config, accessToken, folderId, about);

	return tauri.remoteSync.googleDrive.markSynced({
		workspaceId: manifest.metadata.workspaceId,
		workspaceName: manifest.metadata.workspaceName,
		accountId: account.id,
		remoteFolderId: folderId,
		remoteManifestFileId: refreshedManifest.file.id,
		remoteHeadFileId: refreshedManifest.manifest.head.fileId,
		remoteHeadRevision: refreshedManifest.manifest.head.revision,
		remoteUpdatedAt: refreshedManifest.manifest.metadata.updatedAt,
		driveQuotaBytes: storageSummary.driveQuotaBytes,
		driveUsageBytes: storageSummary.driveUsageBytes,
		appUsageBytes: storageSummary.appUsageBytes
	});
}

async function saveRefreshedRemoteManifestHead(
	config: GoogleDriveConfig,
	accessToken: string,
	folderId: string,
	manifestFile: DriveFile,
	manifest: GoogleDriveManifest,
	remoteHead: GoogleDriveResolvedHead
) {
	await ensureManifestReadyForWrite(config, accessToken, folderId, manifestFile);
	const retainedSnapshots = await deleteStaleWorkspaceSnapshots(config, accessToken, folderId);
	const nextManifest = await buildManifestFromRemoteSnapshots(
		config,
		accessToken,
		folderId,
		manifest.metadata.workspaceId,
		manifest.metadata.workspaceName,
		remoteHead.file,
		manifest,
		{
			createdAt:
				Number.parseInt(remoteHead.file.appProperties?.rentableCreatedAt ?? '', 10) ||
				manifest.head.createdAt,
			source: parseDriveSnapshotSource(remoteHead.file),
			appVersion: remoteHead.file.appProperties?.rentableAppVersion ?? manifest.head.appVersion,
			contentHash: normalizeContentHash(remoteHead.contentHash ?? manifest.head.contentHash)
		},
		retainedSnapshots
	);
	const savedManifest = await saveRemoteManifestFile(
		accessToken,
		folderId,
		manifest.metadata.workspaceId,
		nextManifest
	);

	return {
		file: savedManifest,
		manifest: nextManifest
	};
}

async function saveRemoteManifestFile(
	accessToken: string,
	folderId: string,
	workspaceId: string,
	manifest: GoogleDriveManifest
) {
	return uploadFile(accessToken, {
		name: 'manifest.json',
		parents: [folderId],
		mimeType: 'application/json',
		appProperties: {
			rentableType: 'manifest',
			rentableWorkspaceId: workspaceId
		},
		content: JSON.stringify(manifest, null, 2)
	});
}

async function resolveExistingWorkspaceFolder(
	config: GoogleDriveConfig,
	accessToken: string,
	workspace: RemoteSyncWorkspace
) {
	if (workspace.remoteFolderId) {
		const byId = await tryGetDriveFile(config, accessToken, workspace.remoteFolderId);
		if (byId) return byId;
	}

	const trackedFolder = await resolveWorkspaceFolderFromTrackedRemoteFiles(
		config,
		accessToken,
		workspace
	);
	if (trackedFolder) {
		return trackedFolder;
	}

	const rootFolder = await findDriveFile(
		config,
		accessToken,
		`mimeType='application/vnd.google-apps.folder' and trashed=false and name='${escapeDriveQuery(RENTABLE_ROOT_FOLDER_NAME)}' and appProperties has { key='rentableType' and value='root' }`
	);
	if (!rootFolder) {
		return null;
	}

	const matchingWorkspaceFolder = await findDriveFile(
		config,
		accessToken,
		`'${rootFolder.id}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false and appProperties has { key='rentableWorkspaceId' and value='${escapeDriveQuery(workspace.id)}' }`
	);

	if (matchingWorkspaceFolder) {
		return matchingWorkspaceFolder;
	}

	return await findDriveFile(
		config,
		accessToken,
		`'${rootFolder.id}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false and appProperties has { key='rentableType' and value='workspace' }`,
		{ orderBy: 'modifiedTime desc' }
	);
}

async function resolveWorkspaceFolderFromTrackedRemoteFiles(
	config: GoogleDriveConfig,
	accessToken: string,
	workspace: RemoteSyncWorkspace
) {
	for (const trackedFileId of [workspace.remoteManifestFileId, workspace.remoteHeadFileId]) {
		const normalizedTrackedFileId = trackedFileId?.trim();
		if (!normalizedTrackedFileId) {
			continue;
		}

		const trackedFile = await tryGetDriveFile(config, accessToken, normalizedTrackedFileId);
		const folderId = trackedFile?.parents?.[0]?.trim();
		if (!folderId) {
			continue;
		}

		const folder = await tryGetDriveFile(config, accessToken, folderId);
		if (folder) {
			return folder;
		}
	}

	return null;
}

async function ensureWorkspaceFolder(
	config: GoogleDriveConfig,
	accessToken: string,
	workspace: RemoteSyncWorkspace
) {
	const existing = await resolveExistingWorkspaceFolder(config, accessToken, workspace);
	if (existing) return existing;

	const rootFolder =
		(await findDriveFile(
			config,
			accessToken,
			`mimeType='application/vnd.google-apps.folder' and trashed=false and name='${escapeDriveQuery(RENTABLE_ROOT_FOLDER_NAME)}' and appProperties has { key='rentableType' and value='root' }`
		)) ??
		(await createMetadataFile(config, accessToken, {
			name: RENTABLE_ROOT_FOLDER_NAME,
			mimeType: 'application/vnd.google-apps.folder',
			appProperties: { rentableType: 'root' }
		}));

	return createMetadataFile(config, accessToken, {
		name: workspace.name,
		mimeType: 'application/vnd.google-apps.folder',
		parents: [rootFolder.id],
		appProperties: {
			rentableType: 'workspace',
			rentableWorkspaceId: workspace.id
		}
	});
}

async function resolveManifest(
	config: GoogleDriveConfig,
	accessToken: string,
	workspace: RemoteSyncWorkspace,
	folderId: string
): Promise<GoogleDriveManifestResolution | null> {
	const trackedManifestFile = workspace.remoteManifestFileId
		? await tryGetDriveFile(config, accessToken, workspace.remoteManifestFileId)
		: null;
	const manifestFile =
		(isTrackedManifestFileForFolder(trackedManifestFile, folderId) ? trackedManifestFile : null) ??
		(await findDriveFile(
			config,
			accessToken,
			`'${folderId}' in parents and trashed=false and name='manifest.json' and appProperties has { key='rentableType' and value='manifest' }`,
			{ orderBy: 'modifiedTime desc' }
		));

	if (!manifestFile) {
		return await repairRemoteManifest(config, accessToken, workspace, folderId, null);
	}

	const content = await downloadDriveText(config, accessToken, manifestFile.id);

	try {
		return {
			file: manifestFile,
			manifest: normalizeGoogleDriveManifest(JSON.parse(content)),
			corruption: null
		};
	} catch (error) {
		return await repairRemoteManifest(
			config,
			accessToken,
			workspace,
			folderId,
			manifestFile,
			error
		);
	}
}

async function repairRemoteManifest(
	config: GoogleDriveConfig,
	accessToken: string,
	workspace: RemoteSyncWorkspace,
	folderId: string,
	existingManifestFile: DriveFile | null,
	_error?: unknown
): Promise<GoogleDriveManifestResolution | null> {
	const snapshotFiles = [...(await listWorkspaceSnapshotFiles(config, accessToken, folderId))].sort(
		compareDriveFilesBySnapshotRecency
	);
	const retainedSnapshots = chooseRetainedWorkspaceSnapshots(snapshotFiles);
	const headSnapshot = retainedSnapshots[0] ?? null;

	if (!headSnapshot) {
		return existingManifestFile
			? {
					file: existingManifestFile,
					manifest: null,
					corruption: null
				}
			: null;
	}
	let rebuiltManifest: GoogleDriveManifest;

	try {
		rebuiltManifest = await buildManifestFromRemoteSnapshots(
			config,
			accessToken,
			folderId,
			workspace.id,
			workspace.name,
			headSnapshot.file,
			null,
			{ source: headSnapshot.source },
			retainedSnapshots
		);
	} catch {
		throw new GoogleDriveRelinkRequiredError(headSnapshot.file);
	}

	const savedManifest = await saveRemoteManifestFile(
		accessToken,
		folderId,
		workspace.id,
		rebuiltManifest
	);
	await deleteWorkspaceSnapshotsExcept(
		config,
		accessToken,
		folderId,
		retainedSnapshots.map(({ file }) => file.id)
	);
	await deleteStaleWorkspaceManifests(config, accessToken, folderId, savedManifest.id);

	return {
		file: savedManifest,
		manifest: rebuiltManifest,
		corruption: null
	};
}

function buildRemoteManifestCorruptionMessage(_error: unknown) {
	return toMessage(getGoogleDriveTranslations().settings.syncCorruptDescription());
}

function createConflictState(
	target: { workspace: RemoteSyncWorkspace; account: RemoteSyncAccount },
	manifest: GoogleDriveManifest | null,
	kind: GoogleDriveConflictKind,
	message?: string,
	overrides: { remoteUpdatedAt?: number | null; remoteFilename?: string | null } = {}
): GoogleDriveLinkConflict {
	return {
		kind,
		accountEmail: target.account.email,
		localSnapshotAt: target.workspace.lastSnapshotAt,
		remoteUpdatedAt: overrides.remoteUpdatedAt ?? manifest?.metadata.updatedAt ?? null,
		remoteFilename: overrides.remoteFilename ?? manifest?.head?.filename ?? null,
		...(message ? { message } : {})
	};
}

async function ensureManifestReadyForWrite(
	config: GoogleDriveConfig,
	accessToken: string,
	folderId: string,
	expectedManifestFile: DriveFile | null
) {
	const latestManifestFile = await findDriveFile(
		config,
		accessToken,
		`'${folderId}' in parents and trashed=false and name='manifest.json' and appProperties has { key='rentableType' and value='manifest' }`,
		{ orderBy: 'modifiedTime desc' }
	);

	if (!expectedManifestFile && latestManifestFile) {
		throw createGoogleDriveStaleRemoteStateError();
	}

	if (expectedManifestFile && !latestManifestFile) {
		return null;
	}

	if (!expectedManifestFile) {
		return null;
	}

	if (!latestManifestFile || latestManifestFile.id !== expectedManifestFile.id) {
		throw createGoogleDriveStaleRemoteStateError();
	}

	if (
		latestManifestFile.version !== expectedManifestFile.version ||
		latestManifestFile.modifiedTime !== expectedManifestFile.modifiedTime
	) {
		throw createGoogleDriveStaleRemoteStateError();
	}

	return latestManifestFile;
}

async function buildManifestFromRemoteSnapshots(
	config: GoogleDriveConfig,
	accessToken: string,
	folderId: string,
	workspaceId: string,
	workspaceName: string,
	headFile: DriveFile,
	manifest: GoogleDriveManifest | null,
	headOverrides: Partial<GoogleDriveManifestEntry> = {},
	retainedSnapshots?: GoogleDriveRetainedSnapshot[]
): Promise<GoogleDriveManifest> {
	const snapshots =
		retainedSnapshots ??
		chooseRetainedWorkspaceSnapshots(
			await listWorkspaceSnapshotFiles(config, accessToken, folderId)
		);
	const manifestEntries = new Map((manifest?.entries ?? []).map((entry) => [entry.fileId, entry]));
	const headFallbackEntry = manifestEntries.get(headFile.id) ?? manifest?.head ?? null;
	const resolvedHeadContentHash = await resolveSnapshotContentHash(
		config,
		accessToken,
		headFile,
		normalizeContentHash(headOverrides.contentHash ?? headFallbackEntry?.contentHash ?? null)
	);
	const entries = snapshots
		.map(({ file, source }) =>
			buildManifestEntryFromDriveFile(
				file,
				manifestEntries.get(file.id) ?? manifest?.head ?? null,
				file.id === headFile.id
					? {
							...headOverrides,
							source: headOverrides.source ?? source,
							contentHash: resolvedHeadContentHash
						}
					: { source }
			)
		)
		.filter(
			(entry, index, all) =>
				all.findIndex(
					(candidate) => candidate.fileId === entry.fileId && candidate.revision === entry.revision
				) === index
		)
		.sort(compareManifestEntriesNewestFirst);
	const fallbackHeadEntry = buildManifestEntryFromDriveFile(headFile, headFallbackEntry, {
		...headOverrides,
		contentHash: resolvedHeadContentHash
	});
	const head = entries[0] ?? fallbackHeadEntry;
	const normalizedEntries = entries.some(
		(entry) => entry.fileId === head.fileId && entry.revision === head.revision
	)
		? entries
		: [head, ...entries].sort(compareManifestEntriesNewestFirst);

	return {
		metadata: {
			version: 1,
			provider: 'googleDrive',
			workspaceId,
			workspaceName,
			updatedAt: Date.now()
		},
		entries: normalizedEntries,
		head
	};
}

async function resolveSnapshotContentHash(
	config: GoogleDriveConfig,
	accessToken: string,
	file: DriveFile,
	fallback: string | null
) {
	const normalizedFallback = normalizeContentHash(fallback);
	if (isCryptographicContentHash(normalizedFallback)) {
		return normalizedFallback;
	}

	const metadataHash = normalizeContentHash(file.appProperties?.rentableContentHash ?? null);
	if (isCryptographicContentHash(metadataHash)) {
		return metadataHash;
	}

	const bytes = await downloadDriveFile(config, accessToken, file.id);
	return await computeContentHash(bytes);
}

function buildManifestEntryFromDriveFile(
	file: DriveFile,
	fallback: GoogleDriveManifestEntry | null,
	overrides: Partial<GoogleDriveManifestEntry> = {}
): GoogleDriveManifestEntry {
	const createdAt =
		overrides.createdAt ??
		parseDriveSnapshotCreatedAt(file) ??
		fallback?.createdAt ??
		parseDriveTimestamp(file.modifiedTime) ??
		Date.now();

	return {
		fileId: file.id,
		filename: (overrides.filename ?? file.name) || fallback?.filename || 'snapshot.db',
		createdAt,
		source: overrides.source ?? parseDriveSnapshotSource(file),
		appVersion:
			overrides.appVersion ??
			file.appProperties?.rentableAppVersion ??
			fallback?.appVersion ??
			'unknown',
		revision: overrides.revision ?? file.version ?? fallback?.revision ?? String(createdAt),
		modifiedTime: overrides.modifiedTime ?? file.modifiedTime ?? fallback?.modifiedTime ?? null,
		sizeBytes: overrides.sizeBytes ?? parseDriveNumber(file.size) ?? fallback?.sizeBytes ?? null,
		md5Checksum: overrides.md5Checksum ?? file.md5Checksum ?? fallback?.md5Checksum ?? null,
		contentHash: normalizeContentHash(
			overrides.contentHash ??
				file.appProperties?.rentableContentHash ??
				fallback?.contentHash ??
				null
		)
	};
}

function normalizeGoogleDriveManifest(raw: unknown): GoogleDriveManifest {
	const manifest = (raw ?? {}) as Partial<GoogleDriveManifest>;

	if (!manifest.metadata) {
		throw new Error('Google Drive manifest is missing metadata.');
	}

	if (!manifest.head) {
		throw new Error('Google Drive manifest is missing its head snapshot entry.');
	}

	if (!Array.isArray(manifest.entries)) {
		throw new Error('Google Drive manifest is missing its snapshot entries.');
	}

	const entries = manifest.entries
		.map(normalizeManifestEntry)
		.filter(
			(entry, index, all) =>
				all.findIndex(
					(candidate) => candidate.fileId === entry.fileId && candidate.revision === entry.revision
				) === index
		);
	const head = normalizeManifestEntry(manifest.head);
	const hasHeadEntry = entries.some(
		(entry) => entry.fileId === head.fileId && entry.revision === head.revision
	);

	return {
		metadata: manifest.metadata,
		entries: hasHeadEntry ? entries : [head, ...entries],
		head
	};
}

function normalizeManifestEntry(
	entry: Partial<GoogleDriveManifestEntry>
): GoogleDriveManifestEntry {
	return {
		...entry,
		source: normalizeGoogleDriveSnapshotSource(entry.source),
		contentHash: normalizeContentHash(entry.contentHash)
	} as GoogleDriveManifestEntry;
}

function normalizeGoogleDriveSnapshotSource(value: unknown): GoogleDriveSnapshotSource {
	if (value === 'manual' || value === 'autosave') {
		return value;
	}

	throw new Error('Google Drive manifest snapshot entry is missing a valid source.');
}

function normalizeContentHash(value: string | null | undefined) {
	const normalized = value?.trim();
	return normalized ? normalized.toLowerCase() : null;
}

function isCryptographicContentHash(value: string | null | undefined) {
	const normalized = normalizeContentHash(value);
	return Boolean(normalized && /^[0-9a-f]{64}$/i.test(normalized));
}

async function waitForLinkResult(sessionId: string, options?: GoogleDriveLinkSessionOptions) {
	const startedAt = Date.now();

	while (Date.now() - startedAt < 5 * 60_000) {
		if (options?.signal?.aborted) {
			throw new GoogleDriveLinkCancelledError();
		}

		const result = await tauri.remoteSync.googleDrive.getLinkResult({ sessionId });
		if (result.status !== 'pending') {
			options?.onResult?.(result);
			return result;
		}

		await waitForGoogleDriveLinkPoll(options?.signal);
	}

	await tauri.remoteSync.googleDrive.cancelLink({ sessionId }).catch(() => undefined);
	throw new Error(toMessage(getGoogleDriveTranslations().settings.syncLinkTimedOutDescription()));
}

async function waitForGoogleDriveLinkPoll(signal?: AbortSignal) {
	if (signal?.aborted) {
		throw new GoogleDriveLinkCancelledError();
	}

	await new Promise<void>((resolve, reject) => {
		const timer = window.setTimeout(() => {
			signal?.removeEventListener('abort', onAbort);
			resolve();
		}, 750);

		const onAbort = () => {
			window.clearTimeout(timer);
			signal?.removeEventListener('abort', onAbort);
			reject(new GoogleDriveLinkCancelledError());
		};

		signal?.addEventListener('abort', onAbort, { once: true });
	});
}

function buildAuthorizationUrl(
	config: GoogleDriveConfig,
	clientId: string,
	redirectUri: string,
	state: string,
	codeChallenge: string
) {
	const params = new URLSearchParams({
		client_id: clientId,
		redirect_uri: redirectUri,
		response_type: 'code',
		scope: config.scopes.join(' '),
		access_type: 'offline',
		include_granted_scopes: 'true',
		prompt: 'consent',
		state,
		code_challenge: codeChallenge,
		code_challenge_method: 'S256'
	});

	return `${config.authorizeEndpoint}?${params.toString()}`;
}

async function exchangeAuthorizationCode(
	config: GoogleDriveConfig,
	input: { clientId: string; redirectUri: string; codeVerifier: string; code: string }
) {
	return requestToken(
		config,
		withOptionalClientSecret(config, {
			client_id: input.clientId,
			redirect_uri: input.redirectUri,
			grant_type: 'authorization_code',
			code_verifier: input.codeVerifier,
			code: input.code
		})
	);
}

async function refreshAccessToken(
	config: GoogleDriveConfig,
	clientId: string,
	refreshToken: string
) {
	return requestToken(
		config,
		withOptionalClientSecret(config, {
			client_id: clientId,
			grant_type: 'refresh_token',
			refresh_token: refreshToken
		})
	);
}

function withOptionalClientSecret(config: GoogleDriveConfig, body: Record<string, string>) {
	const clientSecret = config.clientSecret?.trim();

	if (!clientSecret) {
		return body;
	}

	return {
		...body,
		client_secret: clientSecret
	};
}

async function requestToken(config: GoogleDriveConfig, body: Record<string, string>) {
	const response = await fetch(config.tokenEndpoint, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
		body: new URLSearchParams(body)
	});
	const json = (await parseResponseJson(response)) as {
		access_token?: string;
		refresh_token?: string;
		expires_in?: number;
		error?: string;
		error_description?: string;
		error_uri?: string;
	};

	if (!response.ok || !json.access_token) {
		const details = [json.error, json.error_description, json.error_uri]
			.filter(Boolean)
			.join(' — ');
		throw new Error(
			details
				? `Google token exchange failed (${response.status}): ${details}`
				: `Google token exchange failed (${response.status}).`
		);
	}

	return {
		accessToken: json.access_token,
		refreshToken: json.refresh_token ?? null,
		expiresAt: json.expires_in ? Date.now() + json.expires_in * 1000 : null
	};
}

async function fetchGoogleDriveAbout(config: GoogleDriveConfig, accessToken: string) {
	const params = new URLSearchParams({
		fields: 'user(displayName,emailAddress,photoLink,permissionId),storageQuota(limit,usage)'
	});
	return googleDriveJson<DriveAbout>(`${config.driveApiBaseUrl}/about?${params}`, accessToken);
}

async function loadDriveStorageSummary(
	config: GoogleDriveConfig,
	accessToken: string,
	folderId: string | null,
	about?: DriveAbout
): Promise<DriveStorageSummary> {
	const resolvedAbout = about ?? (await fetchGoogleDriveAbout(config, accessToken));
	const folderFiles = folderId
		? await listDriveFiles(config, accessToken, `'${folderId}' in parents and trashed=false`, '100')
		: [];

	return {
		driveQuotaBytes: parseDriveNumber(resolvedAbout.storageQuota?.limit),
		driveUsageBytes: parseDriveNumber(resolvedAbout.storageQuota?.usage),
		appUsageBytes: folderFiles.reduce(
			(total, file) => total + (parseDriveNumber(file.size) ?? 0),
			0
		)
	};
}

async function keepSingleFreshAutosaveSnapshot(syncState: RemoteSyncState) {
	const latestSnapshotFilename = syncState.workspace.lastSnapshotFilename;

	if (!latestSnapshotFilename) {
		return;
	}

	const backups = await api.app.backup.list();
	const obsoleteSnapshots = backups.filter(
		(entry) => entry.source === 'autosave' && entry.filename !== latestSnapshotFilename
	);

	await Promise.allSettled(
		obsoleteSnapshots.map((entry) => api.app.backup.delete({ filename: entry.filename }))
	);
}

async function listWorkspaceSnapshotFiles(
	config: GoogleDriveConfig,
	accessToken: string,
	folderId: string
) {
	const [typedSnapshots, fallbackCandidates] = await Promise.all([
		listDriveFiles(
			config,
			accessToken,
			`'${folderId}' in parents and trashed=false and appProperties has { key='rentableType' and value='snapshot' }`,
			'100',
			'modifiedTime desc'
		),
		listDriveFiles(
			config,
			accessToken,
			`'${folderId}' in parents and trashed=false and name contains 'snapshot-'`,
			'100',
			'modifiedTime desc'
		)
	]);

	const snapshotsById = new Map<string, DriveFile>();

	for (const file of typedSnapshots) {
		snapshotsById.set(file.id, file);
	}

	for (const file of fallbackCandidates) {
		if (isCanonicalSnapshotFilename(file.name)) {
			snapshotsById.set(file.id, file);
		}
	}

	return [...snapshotsById.values()].sort(compareDriveFilesBySnapshotRecency);
}

async function deleteStaleWorkspaceSnapshots(
	config: GoogleDriveConfig,
	accessToken: string,
	folderId: string
) {
	const snapshotFiles = await listWorkspaceSnapshotFiles(config, accessToken, folderId);
	const retainedSnapshots = chooseRetainedWorkspaceSnapshots(snapshotFiles);
	await deleteWorkspaceSnapshotsExcept(
		config,
		accessToken,
		folderId,
		retainedSnapshots.map(({ file }) => file.id)
	);

	return retainedSnapshots;
}

async function deleteWorkspaceSnapshotsExcept(
	config: GoogleDriveConfig,
	accessToken: string,
	folderId: string,
	retainedSnapshotFileIds: string[]
) {
	const snapshotFiles = await listWorkspaceSnapshotFiles(config, accessToken, folderId);
	const retainedSnapshotIds = new Set(retainedSnapshotFileIds);
	const staleSnapshots = snapshotFiles.filter((file) => !retainedSnapshotIds.has(file.id));

	await Promise.all(staleSnapshots.map((file) => deleteDriveFile(config, accessToken, file.id)));
}

function chooseRetainedWorkspaceSnapshots(
	snapshotFiles: DriveFile[]
): GoogleDriveRetainedSnapshot[] {
	const sortedFiles = [...snapshotFiles].sort(compareDriveFilesBySnapshotRecency);
	const latestBySource = new Map<GoogleDriveSnapshotSource, DriveFile>();

	for (const file of sortedFiles) {
		const source = tryParseDriveSnapshotSource(file);
		if (!source) {
			continue;
		}

		if (!latestBySource.has(source)) {
			latestBySource.set(source, file);
		}
	}

	const retained: GoogleDriveRetainedSnapshot[] = [];
	const retainedIds = new Set<string>();
	const addRetained = (file: DriveFile | undefined, source: GoogleDriveSnapshotSource) => {
		if (!file || retainedIds.has(file.id)) {
			return;
		}

		retained.push({ file, source });
		retainedIds.add(file.id);
	};

	addRetained(latestBySource.get('manual'), 'manual');
	addRetained(latestBySource.get('autosave'), 'autosave');

	return retained.sort((left, right) => compareDriveFilesBySnapshotRecency(left.file, right.file));
}

function compareDriveFilesBySnapshotRecency(left: DriveFile, right: DriveFile) {
	const createdAtDiff =
		(parseDriveSnapshotCreatedAt(right) ?? 0) - (parseDriveSnapshotCreatedAt(left) ?? 0);
	if (createdAtDiff !== 0) {
		return createdAtDiff;
	}

	const modifiedAtDiff =
		(parseDriveTimestamp(right.modifiedTime) ?? 0) - (parseDriveTimestamp(left.modifiedTime) ?? 0);
	if (modifiedAtDiff !== 0) {
		return modifiedAtDiff;
	}

	return right.id.localeCompare(left.id);
}

function compareManifestEntriesNewestFirst(
	left: GoogleDriveManifestEntry,
	right: GoogleDriveManifestEntry
) {
	if (right.createdAt !== left.createdAt) {
		return right.createdAt - left.createdAt;
	}

	const modifiedAtDiff =
		(parseDriveTimestamp(right.modifiedTime) ?? 0) - (parseDriveTimestamp(left.modifiedTime) ?? 0);
	if (modifiedAtDiff !== 0) {
		return modifiedAtDiff;
	}

	return right.fileId.localeCompare(left.fileId);
}

async function deleteStaleWorkspaceManifests(
	config: GoogleDriveConfig,
	accessToken: string,
	folderId: string,
	retainedManifestFileId: string
) {
	const manifests = await listDriveFiles(
		config,
		accessToken,
		`'${folderId}' in parents and trashed=false and name='manifest.json' and appProperties has { key='rentableType' and value='manifest' }`,
		'100',
		'modifiedTime desc'
	);
	const staleManifests = manifests.filter((file) => file.id !== retainedManifestFileId);

	await Promise.all(staleManifests.map((file) => deleteDriveFile(config, accessToken, file.id)));
}

async function purgeWorkspaceFolderContents(
	config: GoogleDriveConfig,
	accessToken: string,
	folderId: string
) {
	const files = await listDriveFiles(
		config,
		accessToken,
		`'${folderId}' in parents and trashed=false`,
		'100'
	);

	await Promise.all(files.map((file) => deleteDriveFile(config, accessToken, file.id)));
}

async function findDriveFile(
	config: GoogleDriveConfig,
	accessToken: string,
	q: string,
	options: { orderBy?: string } = {}
) {
	const files = await listDriveFiles(config, accessToken, q, '1', options.orderBy);
	return files[0] ?? null;
}

async function listDriveFiles(
	config: GoogleDriveConfig,
	accessToken: string,
	q: string,
	pageSize = '10',
	orderBy?: string
) {
	const params = new URLSearchParams({
		q,
		fields: `files(${DRIVE_FIELDS})`,
		pageSize,
		spaces: 'drive'
	});

	if (orderBy) {
		params.set('orderBy', orderBy);
	}

	const response = await googleDriveJson<{ files?: DriveFile[] }>(
		`${config.driveApiBaseUrl}/files?${params}`,
		accessToken
	);
	return response.files ?? [];
}

async function tryGetDriveFile(config: GoogleDriveConfig, accessToken: string, fileId: string) {
	const response = await fetch(
		`${config.driveApiBaseUrl}/files/${fileId}?fields=${encodeURIComponent(DRIVE_FIELDS)}`,
		{
			headers: { Authorization: `Bearer ${accessToken}` }
		}
	);
	if (response.status === 404) {
		return null;
	}
	if (response.status === 403) {
		const message = await readGoogleDriveError(response);
		if (isDriveFileAccessDeniedMessage(message)) {
			return null;
		}
		throw new Error(message);
	}
	return (await parseDriveResponse<DriveFile>(response)) as DriveFile;
}

async function deleteDriveFile(config: GoogleDriveConfig, accessToken: string, fileId: string) {
	const response = await fetch(`${config.driveApiBaseUrl}/files/${fileId}`, {
		method: 'DELETE',
		headers: { Authorization: `Bearer ${accessToken}` }
	});

	if (response.status === 404) {
		return;
	}

	if (!response.ok) {
		throw new Error(await readGoogleDriveError(response));
	}
}

async function createMetadataFile(
	config: GoogleDriveConfig,
	accessToken: string,
	metadata: Record<string, unknown>
) {
	return googleDriveJson<DriveFile>(
		`${config.driveApiBaseUrl}/files?fields=${encodeURIComponent(DRIVE_FIELDS)}`,
		accessToken,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(metadata)
		}
	);
}

async function uploadFile(
	accessToken: string,
	input: {
		fileId?: string;
		name: string;
		parents: string[];
		mimeType: string;
		appProperties?: Record<string, string>;
		content: string | Uint8Array;
	}
) {
	const metadata = {
		name: input.name,
		appProperties: input.appProperties,
		...(input.fileId ? {} : { parents: input.parents })
	};
	const boundary = `rentable-${randomToken()}`;
	const body = new Blob([
		`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
		JSON.stringify(metadata),
		`\r\n--${boundary}\r\nContent-Type: ${input.mimeType}\r\n\r\n`,
		typeof input.content === 'string' ? input.content : new Uint8Array(input.content).buffer,
		`\r\n--${boundary}--`
	]);
	const url = input.fileId
		? `${GOOGLE_DRIVE_UPLOAD_FILES_URL}/${input.fileId}?uploadType=multipart&fields=${encodeURIComponent(DRIVE_FIELDS)}`
		: `${GOOGLE_DRIVE_UPLOAD_FILES_URL}?uploadType=multipart&fields=${encodeURIComponent(DRIVE_FIELDS)}`;

	return googleDriveJson<DriveFile>(url, accessToken, {
		method: input.fileId ? 'PATCH' : 'POST',
		headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
		body
	});
}

async function downloadDriveFile(config: GoogleDriveConfig, accessToken: string, fileId: string) {
	const response = await fetch(`${config.driveApiBaseUrl}/files/${fileId}?alt=media`, {
		headers: { Authorization: `Bearer ${accessToken}` }
	});
	if (!response.ok) {
		throw new Error(await readGoogleDriveError(response));
	}

	return new Uint8Array(await response.arrayBuffer());
}

async function downloadDriveText(config: GoogleDriveConfig, accessToken: string, fileId: string) {
	const bytes = await downloadDriveFile(config, accessToken, fileId);
	return new TextDecoder().decode(bytes);
}

async function googleDriveJson<T>(url: string, accessToken: string, init: RequestInit = {}) {
	const response = await fetch(url, {
		...init,
		headers: {
			Authorization: `Bearer ${accessToken}`,
			...(init.headers ?? {})
		}
	});
	return parseDriveResponse<T>(response);
}

async function parseDriveResponse<T>(response: Response) {
	if (!response.ok) {
		throw new Error(await readGoogleDriveError(response));
	}

	return (await parseResponseJson(response)) as T;
}

async function parseResponseJson(response: Response) {
	const text = await response.text();
	return text ? (JSON.parse(text) as unknown) : {};
}

async function readGoogleDriveError(response: Response) {
	try {
		const json = (await parseResponseJson(response)) as {
			error?: { message?: string };
			error_description?: string;
		};
		return (
			json.error?.message ??
			json.error_description ??
			`Google Drive request failed (${response.status}).`
		);
	} catch {
		return `Google Drive request failed (${response.status}).`;
	}
}

function isDriveFileAccessDeniedMessage(message: string) {
	const normalized = message.toLowerCase();
	return (
		normalized.includes('not granted the app') ||
		normalized.includes('read access to the file') ||
		normalized.includes('insufficient file permissions') ||
		normalized.includes('does not have sufficient permissions') ||
		normalized.includes('app is not authorized to access this file')
	);
}

function parseDriveNumber(value: string | undefined) {
	if (!value) return null;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function parseDriveTimestamp(value: string | null | undefined) {
	if (!value) {
		return null;
	}

	const parsed = Date.parse(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function parseDriveSnapshotCreatedAt(file: DriveFile) {
	const createdAt = Number.parseInt(file.appProperties?.rentableCreatedAt ?? '', 10);
	return Number.isFinite(createdAt) && createdAt > 0 ? createdAt : null;
}

function tryParseDriveSnapshotSource(file: DriveFile): GoogleDriveSnapshotSource | null {
	const source = file.appProperties?.rentableSource?.trim().toLowerCase();
	if (source === 'manual' || source === 'autosave') {
		return source;
	}

	return null;
}

function parseDriveSnapshotSource(file: DriveFile): GoogleDriveSnapshotSource {
	const source = tryParseDriveSnapshotSource(file);
	if (source) {
		return source;
	}

	throw new Error(`Google Drive snapshot ${file.id} is missing a valid source.`);
}

function isTrackedManifestFileForFolder(file: DriveFile | null, folderId: string) {
	if (!file || file.name !== 'manifest.json') {
		return false;
	}

	if (file.appProperties?.rentableType?.trim().toLowerCase() !== 'manifest') {
		return false;
	}

	return file.parents?.some((parentId) => parentId?.trim() === folderId) ?? false;
}

function isCanonicalSnapshotFilename(filename: string | null | undefined) {
	const normalized = filename?.trim().toLowerCase() ?? '';
	return normalized.startsWith('snapshot-') && normalized.endsWith('.db');
}

function escapeDriveQuery(value: string) {
	return value.replaceAll("'", "\\'");
}

async function loadLocalWorkspaceContentHash() {
	try {
		const fingerprint = await tauri.remoteSync.googleDrive.getLocalFingerprint();
		return normalizeContentHash(fingerprint.contentHash);
	} catch {
		return null;
	}
}

async function resolveRemoteHeadState(
	config: GoogleDriveConfig,
	accessToken: string,
	manifest: GoogleDriveManifest
) {
	const file = await tryGetDriveFile(config, accessToken, manifest.head.fileId);
	if (!file) {
		return null;
	}

	const changedFromManifest = didRemoteHeadChangeFromManifest(manifest.head, file);
	if (!changedFromManifest && isCryptographicContentHash(manifest.head.contentHash)) {
		return {
			file,
			contentHash: normalizeContentHash(manifest.head.contentHash),
			changedFromManifest
		};
	}

	try {
		const bytes = await downloadDriveFile(config, accessToken, file.id);
		return {
			file,
			contentHash: await computeContentHash(bytes),
			changedFromManifest
		};
	} catch {
		return {
			file,
			contentHash: null,
			changedFromManifest
		};
	}
}

function didRemoteHeadChangeFromManifest(head: GoogleDriveManifestEntry, file: DriveFile) {
	if (file.id !== head.fileId) {
		return true;
	}

	if (file.version && file.version !== head.revision) {
		return true;
	}

	if (file.modifiedTime && file.modifiedTime !== head.modifiedTime) {
		return true;
	}

	const sizeBytes = parseDriveNumber(file.size);
	if (sizeBytes !== null && sizeBytes !== head.sizeBytes) {
		return true;
	}

	if (file.md5Checksum && file.md5Checksum !== head.md5Checksum) {
		return true;
	}

	const fileContentHash = normalizeContentHash(file.appProperties?.rentableContentHash ?? null);
	const manifestContentHash = normalizeContentHash(head.contentHash);
	if (fileContentHash && fileContentHash !== manifestContentHash) {
		return true;
	}

	return false;
}

function base64ToUint8Array(value: string) {
	const binary = globalThis.atob(value);
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index);
	}
	return bytes;
}

function uint8ArrayToBase64(bytes: Uint8Array) {
	let binary = '';
	for (let index = 0; index < bytes.length; index += 0x8000) {
		binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
	}
	return globalThis.btoa(binary);
}

async function computeContentHash(bytes: Uint8Array) {
	const source = new Uint8Array(bytes);
	const digest = await globalThis.crypto.subtle.digest('SHA-256', source);
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function randomToken() {
	const bytes = new Uint8Array(32);
	globalThis.crypto.getRandomValues(bytes);
	return base64UrlEncode(bytes);
}

async function createPkceChallenge(verifier: string) {
	const digest = await globalThis.crypto.subtle.digest(
		'SHA-256',
		new TextEncoder().encode(verifier)
	);
	return base64UrlEncode(new Uint8Array(digest));
}

function base64UrlEncode(bytes: Uint8Array) {
	return uint8ArrayToBase64(bytes).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
