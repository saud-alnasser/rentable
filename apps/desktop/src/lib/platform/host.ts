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
 *
 * **What is a feature's is the feature's.** The organization declares its own port in
 * `$lib/organization/host`, and `$lib/app/host` composes the two into the application's `Host`.
 */

import type { AppearanceSetting } from './appearance';

export type Settings = {
	endingSoonNoticeDays: number;
	databasePath: string;
	diagnosticsDir: string;
	locale: string | null;
	/** light, dark, or following the system; a file written before it existed reads as system. */
	appearance: AppearanceSetting;
	version: string;
	/**
	 * whether the records an earlier version left on this machine were brought in or put aside,
	 * so they are offered no more. A file written before it existed reads as not yet.
	 */
	earlierRecordsSettled: boolean;
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

/**
 * A release before organizations that kept every record in `app.db`, named as the release was.
 * 0.12.0 left the file at workspace schema 2, and 0.13.0 at schema 3.
 */
export type EarlierVersion = '0.12.0' | '0.13.0';

/** The records of an earlier version, found in `app.db`. */
export type EarlierRecords = {
	version: EarlierVersion;
};

/** The records of an earlier version, read as the whole-workspace export. */
export type EarlierRead = {
	version: EarlierVersion;
	/** where the export's workbook was written, which is the copy the person keeps. */
	path: string;
	/** that workbook's sheets, as `import.readBook` hands over a file the person chose. */
	tables: ImportTable[];
};

export type DiagnosticRecord = {
	level: 'info' | 'warn' | 'error';
	event: string;
	fields: Record<string, string>;
};

export type SettingsChangeset = {
	endingSoonNoticeDays?: number;
	locale?: string;
	appearance?: AppearanceSetting;
	earlierRecordsSettled?: boolean;
};

/**
 * **The Rust side carries two more members than this declares**, `remoteId` and `remoteUrl`, which
 * name the workspace in the organization and where its replica syncs. They are the store's, read
 * at the next launch, and nothing on this side has a use for either, so they are not
 * declared here rather than declared and ignored. Add them when something reads them.
 *
 * *`permissions` is the rule being followed rather than an exception to it: it is declared because
 * this side is the only side that reads it. The bits are named in `@rentable/workspace-permission`
 * and Rust carries the number without opening it.*
 */
export type RemoteSyncWorkspace = {
	id: string;
	name: string;
	localDatabasePath: string;
	/**
	 * the workspace this machine has open, by the id the organization knows it under, or `null`
	 * where it has never opened one. Read by startup to reopen the one held last; Rust has carried
	 * it since sign-in learned a workspace, and this side reads it since organizations gave a
	 * member several to choose between.
	 */
	remoteId: string | null;
	/**
	 * what the signed-in account may do in this workspace, as one number.
	 *
	 * **Never read as a number.** `permits` from `@rentable/workspace-permission` is what answers a
	 * question about it, by the name of an act — a surface that reached for a bit index or a mask
	 * would be a second copy of the mapping, and the package exists so there is only one.
	 *
	 * **`0` on a machine that has heard nothing**, which is a member who administers nothing. It is
	 * what a store written before this field and a machine that has never signed in both come
	 * to, and it is the safe direction: every gated control is drawn as absent or unavailable
	 * rather than offered to somebody the signed row would refuse.
	 *
	 * **A second opinion, offered earlier, and never the one that decides.** The Rust side
	 * refuses the request against the member's row whatever this says; a client is a thing a
	 * person can edit.
	 */
	permissions: number;
	lastError: string | null;
	createdAt: number;
	updatedAt: number;
};

export type RemoteSyncState = {
	workspace: RemoteSyncWorkspace;
	startupPromptEnabled: boolean;
	deviceId: string;
	/**
	 * a replication Turso refused for the organization's account, standing until one goes
	 * through. Distinct from every other reason a machine is not syncing: a person over quota and
	 * a person offline need different things. What Turso said is the owner's alone, read through
	 * `organization.accountRefusalDetail`.
	 */
	accountRefusal: { since: number } | null;
	/**
	 * a replication Turso refused for this member's credential that a reconnect did not settle,
	 * standing until one goes through. A lock-out rotated the credential and this machine has no
	 * re-sealed one yet; the member is told their access needs attention rather than shown nothing.
	 */
	credentialRefusal: { since: number } | null;
	/**
	 * the moment of the last replication that went through, as epoch milliseconds, or `null`
	 * before any has: the remote took the push or answered the pull, whether or not it had
	 * anything to bring. What the standing block says beside "up to date" (effort 828,
	 * requirement 25). Recorded on this machine, so it reads on a launch made offline.
	 */
	lastReachedAt: number | null;
};

/** why a replication did not go, where Turso said: the account's, the credential's, or neither. */
export type ReplicationRefusal = 'none' | 'account' | 'credential';

/**
 * where the signed-in member stands after a replication.
 *
 * **`signedOutElsewhere` is the one answer a caller has to act on**: somebody ended this member's
 * sessions from another machine, the shell has already put the wall up on its own side, and what
 * is left for this side is to read where the machine stands again. It is a standing and not a
 * refusal, because nothing failed.
 */
export type SessionStanding = 'held' | 'signedOutElsewhere';

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
 * what the API may ask of the shell it runs in, less what a feature's own port declares.
 *
 * Declared, not read off an implementation — that is the whole of it. The Tauri facade
 * satisfies this interface and the compiler says so, so the two cannot drift quietly, and a
 * second client kind becomes an implementation of this rather than a rewrite of that.
 *
 * **Not the whole host.** A feature that crosses to Rust declares its own port in its
 * `host.ts`, and `$lib/app/host` composes the application's `Host` from this and each of those.
 */
export type PlatformHost = {
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
	print: {
		/**
		 * Print what the window's print sheet holds: to paper through the operating system's dialog,
		 * or to the PDF file at `path`, written with no dialog on Windows (`tauri/src/print.rs`).
		 */
		page: (
			request: ({ mode: 'print' } | { mode: 'pdf'; path: string }) & {
				page?: { head: string; lang: string; dir: string; body: string };
			}
		) => Promise<void>;
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
	earlier: {
		/**
		 * Whether this machine's `app.db` holds the records of 0.12.0 or 0.13.0, and which, or
		 * nothing. The file is opened read-only and never created.
		 */
		find: () => Promise<EarlierRecords | null>;
		/**
		 * Read those records as the whole-workspace export, write them as its workbook under
		 * `backups/app/`, and hand back that workbook's sheets for the workspace import to plan
		 * over. Nothing is written to `app.db`; a file holding no such records is refused.
		 */
		read: () => Promise<EarlierRead>;
	};
	dialog: {
		/** Ask the user for a file, answering its path or nothing where they walked away. */
		openFile: () => Promise<string | null>;
		/** Ask the user for an image, a PNG, JPEG or WebP, answering its path or nothing. */
		openImage: () => Promise<string | null>;
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
		 * send what this machine wrote, take what the others wrote, and say what each half did.
		 *
		 * **`received` is an event and `pushed` is a schedule.** Rows that arrived change derived
		 * state, so they have to be reconciled and the query cache told; a push that did not go has
		 * to be tried again, and a caller that could not tell would have nothing to arm a retry on.
		 */
		replicate: () => Promise<{
			pushed: boolean;
			received: boolean;
			refusal: ReplicationRefusal;
			/**
			 * where the signed-in member stands after it. The same call is what ends a session
			 * that was ended from another machine, because it is what the heartbeat calls and the
			 * heartbeat is what runs on a machine nobody is touching.
			 */
			standing: SessionStanding;
		}>;
		/** send what this machine wrote and nothing else, for the last call of a session. */
		push: () => Promise<boolean>;
		/**
		 * call this machine's workspace something else, and say what that left it called.
		 *
		 * **The name belongs to the organization rather than to this machine**, so this writes
		 * the sealed row. Written locally instead, two machines signed in to one workspace would disagree
		 * about what it is called, which is a per-machine nickname rather than a rename, and the
		 * `renameWorkspace` permission would have nothing to guard.
		 *
		 * Answers with the state, so a caller reads the name it just set. Every surface that draws
		 * a workspace name reads one query, so one invalidation covers all three.
		 *
		 * A machine with no organization, no workspace it has signed in to, or no
		 * session, refuses rather than renaming locally. Each says which of the three it was.
		 */
		renameWorkspace: (name: string) => Promise<RemoteSyncState>;
	};
};
