/**
 * HOST
 *
 * the desktop shell as a declared interface, and the payload types it speaks in.
 *
 * The port sits here rather than beside its implementation on purpose: a client that is not
 * the Tauri shell has to be able to satisfy it, and a port declared inside the facade would
 * put that facade — and every `@tauri-apps` package it imports — into such a client's graph
 * just to read a type. Nothing in this file imports one, and that is the property to keep.
 *
 * Which of these capabilities mean anything away from the desktop is a separate question and
 * is not answered here. There is one implementation, and no second one is being built.
 */

export type Settings = {
	endingSoonNoticeDays: number;
	databasePath: string;
	diagnosticsDir: string;
	locale: string | null;
	version: string;
};

/**
 * One cell of a workbook, as the kind of thing it is.
 *
 * Money and dates cross as figures rather than as the text a surface drew, because the file's
 * reader is a spreadsheet: it renders a number in whatever locale the person opening it works
 * in, and can do nothing with a string that merely looks like one. `date` is the count of days
 * the format itself counts in.
 */
export type ExportCell =
	| { kind: 'text'; value: string }
	| { kind: 'number'; value: number }
	| { kind: 'date'; value: number }
	| { kind: 'money'; value: number }
	| { kind: 'empty' };

/** One sheet of a workbook: its headings, and its rows under them. */
export type ExportSheet = {
	/**
	 * what the tab is called.
	 *
	 * Left out where the workbook holds one sheet — there is nothing to tell it apart from.
	 * Given where it holds several, which is how a reader finds the tenants inside a workspace.
	 */
	name?: string;
	headers: string[];
	rows: ExportCell[][];
};

/** A file read back in: the heading row, and the rows under it, all as text. */
export type ImportTable = {
	/** the sheet it came off, or the file's own name where the format has no sheets. */
	name: string;
	headers: string[];
	rows: string[][];
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

/**
 * where a workspace's record of truth is.
 *
 * `hosted` is additive: a store persisted before it existed holds one of the other two and
 * still deserialises, and `local` is both the default and what an unconfigured install
 * already had. The Rust side is `RemoteSyncProvider` in `tauri/src/sync/store.rs`, and the
 * two are one type across the boundary — a value added on one side and not the other is a
 * mismatch nothing would report.
 */
export type RemoteSyncProvider = 'local' | 'googleDrive' | 'hosted';

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
	downloadAndInstall: (onEvent?: (event: UpdaterDownloadEvent) => void) => Promise<void>;
	close: () => Promise<void>;
};

/**
 * how far a download has got.
 *
 * Spelled out rather than aliased to the updater plugin's own type, so that reading this port
 * does not require that plugin. It is the same shape, and `mapUpdate` in the facade is where
 * the compiler checks that it still is.
 */
export type UpdaterDownloadEvent =
	| { event: 'Started'; data: { contentLength?: number } }
	| { event: 'Progress'; data: { chunkLength: number } }
	| { event: 'Finished' };

/** what a listener hands back to stop listening. */
export type Unlisten = () => void;

/**
 * what the API may ask of the shell it runs in.
 *
 * Declared, not read off an implementation — that is the whole of it. The Tauri facade
 * satisfies this interface and the compiler says so, so the two cannot drift quietly, and a
 * second client kind becomes an implementation of this rather than a rewrite of that.
 */
export type Host = {
	bootstrap: () => Promise<Recovery>;
	window: {
		show: () => Promise<void>;
		hide: () => Promise<void>;
		minimize: () => Promise<void>;
		maximize: () => Promise<void>;
		drag: () => Promise<void>;
		close: () => Promise<void>;
		restart: () => Promise<void>;
	};
	opener: {
		openUrl: (url: string) => Promise<void>;
		revealItemInDir: (path: string) => Promise<void>;
	};
	export: {
		/**
		 * Write text to the path the user chose, and answer with where it landed.
		 *
		 * The path is theirs, from the save dialog below — symmetric with `import.read`, which is
		 * handed one from the open dialog. Where a file may go is not this layer's question.
		 */
		write: (path: string, contents: string) => Promise<string>;
		/**
		 * Write a workbook to the path the user chose, and answer with where it landed.
		 *
		 * The cells cross as the kinds of thing they are — a count as a count, a day as a day —
		 * and this side spells each one. A figure rendered before it crossed could not be added
		 * up by whatever opened the file, and carried a locale that file's reader never chose.
		 */
		writeWorkbook: (path: string, sheets: ExportSheet[]) => Promise<string>;
	};
	import: {
		/**
		 * Read a file the user chose, as a table of text.
		 *
		 * What comes back is strings. Which column means what, and whether a row is a record, are
		 * questions about tenants and contracts that the reader does not answer.
		 */
		read: (path: string) => Promise<ImportTable>;
		/**
		 * Read every sheet of a file the user chose.
		 *
		 * What a whole workspace arrives as. The tables come back in the file's own order and each
		 * says which sheet it is — the caller matches them by that name and never by position,
		 * because a reader who dragged the tabs about handed over the same workspace.
		 */
		readBook: (path: string) => Promise<ImportTable[]>;
	};
	dialog: {
		/** Ask the user for a file, answering its path or nothing where they walked away. */
		openFile: () => Promise<string | null>;
		/** Ask the user where a file goes, answering its path or nothing where they walked away. */
		saveFile: (defaultName: string) => Promise<string | null>;
	};
	diagnostics: {
		write: (record: DiagnosticRecord) => Promise<void>;
	};
	update: {
		prepare: (targetVersion: string) => Promise<Recovery>;
		check: () => Promise<AvailableUpdate | null>;
	};
	settings: {
		get: () => Promise<Settings>;
		set: (changeset: SettingsChangeset) => Promise<Settings>;
	};
	backup: {
		list: () => Promise<BackupEntry[]>;
		create: () => Promise<BackupEntry>;
		delete: (filename: string) => Promise<void>;
		restore: (filename: string) => Promise<void>;
	};
	remoteSync: {
		getState: () => Promise<RemoteSyncState>;
		snapshotNow: () => Promise<RemoteSyncState>;
		autosaveNow: () => Promise<RemoteSyncState>;
		googleDrive: {
			/**
			 * link this workspace to a google account, end to end. outstanding for as
			 * long as the user takes over the consent screen; rejects with a
			 * `cancelled` error where they abandon it.
			 */
			link: () => Promise<GoogleDriveLinkPreparation>;
			/** abandon the link that is outstanding, and undo one already recorded. */
			cancelLinkAttempt: () => Promise<RemoteSyncState>;
			/** disconnect this workspace, keeping one current snapshot of it on this machine. */
			unlink: () => Promise<RemoteSyncState>;
			/**
			 * exchange this workspace with the account it is linked to, end to end.
			 * `manual` says the user asked, which decides what the snapshot a push
			 * sends counts as. rejects with a `busy` error where a sync is already
			 * running.
			 */
			sync: (input?: { manual?: boolean }) => Promise<GoogleDriveSyncOutcome>;
			/**
			 * ask what the remote holds for this workspace, and whether the two
			 * sides can be reconciled without the user. resolves to `null` where
			 * the workspace is not on Drive.
			 */
			inspect: () => Promise<GoogleDriveLinkPreparation | null>;
			/**
			 * settle the conflict the user was asked about, the way they chose.
			 * `local` keeps this machine's copy, `remote` keeps the remote's. The
			 * remote is read again, so answering twice settles the same way.
			 */
			resolveConflict: (input: {
				resolution: GoogleDriveConflictResolution;
			}) => Promise<GoogleDriveSyncOutcome>;
			/** watch how far a link has got. resolves to its own removal. */
			onLinkPhase: (listener: (phase: GoogleDriveLinkPhase) => void) => Promise<Unlisten>;
		};
	};
};
