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

export type RemoteSyncAccountStatus = 'pending' | 'ready' | 'needsReconnect';

export type RemoteSyncAccount = {
	id: string;
	status: RemoteSyncAccountStatus;
	email: string;
	displayName: string;
	avatarUrl: string | null;
	/**
	 * who Google says this is — the OpenID `sub` claim, which is what the control-plane API
	 * keys an account by.
	 *
	 * *It held Drive's `permissionId` until Drive sync retired: the same person under a scheme
	 * nothing else here spoke.*
	 */
	providerUserId: string | null;
	tokenExpiresAt: number | null;
	refreshTokenAvailable: boolean;
	lastError: string | null;
	createdAt: number;
	updatedAt: number;
};

/**
 * **The Rust side carries two more members than this declares**, `remoteId` and `remoteUrl`, which
 * name the workspace in the control plane and where its replica syncs. They are the store's, read
 * by the mint on the next launch, and nothing on this side has a use for either — so they are not
 * declared here rather than declared and ignored. Add them when something reads them.
 */
export type RemoteSyncWorkspace = {
	id: string;
	name: string;
	localDatabasePath: string;
	lastError: string | null;
	createdAt: number;
	updatedAt: number;
};

/**
 * how much longer this machine may go on replicating, as the control plane issued it.
 *
 * **The moments cross and the token does not.** A session token is a bearer credential and
 * stays behind the credential boundary in Rust; these are facts *about* a credential rather than
 * one, exactly as `RemoteSyncAccount.tokenExpiresAt` already is — and the side that decides
 * whether to keep replicating cannot decide without them.
 *
 * **Three, because they are started by different calls.** `expiresAt` is the refresh window — how
 * much longer this machine may work without reaching the control plane. `replicaExpiresAt` is how
 * much longer the credential the replica actually syncs with lives. `absoluteExpiresAt` is when
 * the sign-in itself dies and no refresh extends it. A refresh moves the first alone, a mint
 * restarts the first two, and **nothing moves the third** — so equal lengths do not make them one
 * clock, and the earliest of them is what governs. `replicaExpiresAt` is `null` until something
 * has minted one.
 */
export type SessionWindow = {
	accountId: string;
	expiresAt: number;
	replicaExpiresAt: number | null;
	absoluteExpiresAt: number;
	updatedAt: number;
};

export type RemoteSyncState = {
	accounts: RemoteSyncAccount[];
	workspace: RemoteSyncWorkspace;
	startupPromptEnabled: boolean;
	/** whether this build was given an OAuth client to sign in with. */
	googleSignInReady: boolean;
	/** whether this build was told where a control plane is. A capability, reported like the one above. */
	controlPlaneReady: boolean;
	/** the window this machine holds, or nothing where it holds no session. */
	session: SessionWindow | null;
	deviceId: string;
};

/**
 * how far a sign-in has got. signing in is one call, so progress arrives on an event instead of
 * a return.
 */
export type GoogleSignInPhase = 'authorizing' | 'finalizing';

/**
 * the route back from a version that will not run.
 *
 * *The protected snapshot and the fields naming it went with the backup surface (#569). The
 * record of truth is in Turso, so a failed update costs no data and there is nothing to restore;
 * what a user still needs is the release they came from, which is all this carries now.*
 */
export type Recovery = {
	targetVersion: string;
	previousVersion: string;
	updateError: string | null;
	status: 'pending' | 'obsolete';
	previousReleaseUrl: string;
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
	/**
	 * who this machine is signed in as.
	 *
	 * Its own capability, and not a step inside linking a Drive folder, which is where it lived
	 * until 2026-08-18 — and the folder went with Drive sync. It is the first thing the
	 * application asks for and the only way past its opening screen (#571), so a client that is
	 * not this shell needs it before it needs anything else.
	 */
	auth: {
		google: {
			/**
			 * sign in with google, end to end. outstanding for as long as the user takes
			 * over the consent screen; rejects with a `cancelled` error where they
			 * abandon it.
			 */
			signIn: () => Promise<RemoteSyncState>;
			/**
			 * give up the identity this machine holds. the account row stays, saying what it
			 * is waiting for. rejects where nobody is signed in.
			 */
			signOut: () => Promise<RemoteSyncState>;
			/** watch how far a sign-in has got. resolves to its own removal. */
			onPhase: (listener: (phase: GoogleSignInPhase) => void) => Promise<Unlisten>;
		};
	};
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
	remoteSync: {
		getState: () => Promise<RemoteSyncState>;
		/**
		 * reach the control plane and restart the window, where there is one to restart.
		 *
		 * This is *reaching the API inside the window*, as a call the application makes. Being
		 * offline is not a failure — the window stays where it was and the client goes on
		 * replicating until it closes on its own. A control plane that **declines** to renew is
		 * different: the session is given up, and the answer says so by carrying no window.
		 */
		renewSession: () => Promise<RemoteSyncState>;
		/**
		 * send what this machine wrote, take what the others wrote, and say what each half did.
		 *
		 * **`received` is an event and `pushed` is a schedule.** Rows that arrived change derived
		 * state, so they have to be reconciled and the query cache told; a push that did not go has
		 * to be tried again, and a caller that could not tell would have nothing to arm a retry on.
		 */
		replicate: () => Promise<{ pushed: boolean; received: boolean }>;
		/** send what this machine wrote and nothing else, for the last call of a session. */
		push: () => Promise<boolean>;
	};
};
