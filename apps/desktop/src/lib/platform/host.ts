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
	/**
	 * the account's picture, as a complete `data:` URL, or nothing.
	 *
	 * **The Rust side also carries `avatarUrl`, and it deliberately does not cross.** That is
	 * Google's own address for the same image, so a surface handed it would reach
	 * `lh3.googleusercontent.com` every time it drew: nothing with no network, and an outbound
	 * request announcing that the application was opened. The bytes are fetched once at sign-in
	 * instead, and this is what comes back. `sync/google/picture.rs` has the bounds.
	 */
	avatarImage: string | null;
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
	 * what an older control plane, a store written before this field, and a machine that has never
	 * signed in all come to, and it is the safe direction: every gated control is drawn as absent
	 * or unavailable rather than offered to somebody the control plane would refuse.
	 *
	 * **A second opinion, offered earlier, and never the one that decides.** The control plane
	 * refuses the request whatever this says; a client is a thing a person can edit.
	 */
	permissions: number;
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
 * a started Turso consent: the address the person answers at, and the handle the shell reports
 * its progress under. What is behind the address stays in Rust.
 */
export type OrganizationConsentStart = {
	sessionId: string;
	authorizationUrl: string;
};

/**
 * how far one consent has got. `granted` means the token is in the keyring, where the next
 * command will look for it; it is never in this value.
 */
export type OrganizationConsentResult = {
	sessionId: string;
	status: 'pending' | 'granted' | 'failed' | 'abandoned';
	error: string | null;
};

/**
 * what a first run answers with: the organization's id, the link an owner hands out, and
 * whether the rows have reached Turso yet. No key, no token, no password.
 */
export type OrganizationCreated = {
	organizationId: string;
	joinLink: string;
	synced: boolean;
};

/** one organization this machine has joined, as the sign-in screen lists it. No key. */
export type JoinedOrganization = {
	id: string;
	name: string;
	memberId: string;
	/** their role there, as last read. A display fact: what a member may do is what their vault holds. */
	role: string;
	joinedAt: number;
};

/** one workspace a signed-in member holds a grant on. No credential. */
export type OrganizationWorkspace = {
	id: string;
	name: string;
	databaseName: string;
	databaseHostname: string;
	schemaVersion: number;
	/** what the member's grant is good for, `full-access` or `read-only`. */
	accessLevel: string;
};

/**
 * the member whose password opened a vault in this process: facts about them and their
 * workspaces, and no key. `null` on the far side of the wall.
 */
export type OrganizationSession = {
	organizationId: string;
	organizationName: string;
	memberId: string;
	email: string;
	displayName: string;
	role: string;
	permissions: number;
	mustChangePassword: boolean;
	workspaces: OrganizationWorkspace[];
};

/** where a link's invitation stands, as the join screen is told before it asks for anything. */
export type LinkStanding = 'open' | 'lapsed' | 'consumed' | 'revoked' | 'none';

/** what a lock-out costs, said before it runs: which workspaces rotate, and how many members stop syncing. */
export type LockOutCost = {
	workspaces: { id: string; name: string; members: number }[];
	/** distinct members across every workspace above, other than the removed and the remover. */
	membersAffected: number;
};

/** what a removal did. */
export type MemberRemoved = {
	memberId: string;
	lockedOut: boolean;
	rotatedWorkspaceIds: string[];
	othersMustReconnect: number;
};

/**
 * what a join link says once the organization it names has been reached: its name, where it is,
 * and where the invitation stands. No credential, no key, no secret; the link was parsed in Rust.
 */
export type LinkFacts = {
	organizationId: string;
	organizationName: string;
	remoteUrl: string;
	standing: LinkStanding;
};

/**
 * where this machine stands with organizations: which it has joined, and who is signed in.
 * What the sign-in wall admits on.
 */
export type OrganizationState = {
	organizations: JoinedOrganization[];
	session: OrganizationSession | null;
};

/** one member as the dashboard lists them. Names opened on the other side; no key, no credential. */
export type OrganizationMember = {
	id: string;
	email: string;
	displayName: string;
	role: string;
	permissions: number;
	mustChangePassword: boolean;
	workspaceIds: string[];
	createdAt: number;
};

/** one invitation and where it stands now. */
export type OrganizationInvitation = {
	id: string;
	memberId: string;
	expiresAt: number;
	consumedAt: number | null;
	createdAt: number;
	standing: 'open' | 'lapsed' | 'consumed';
};

/**
 * what an invitation makes, shown to the administrator once. The password is in it because it has
 * to be shown; it crosses exactly once and is held nowhere afterwards.
 */
export type Invited = {
	memberId: string;
	invitationId: string;
	joinLink: string;
	generatedPassword: string;
	expiresAt: number;
	/**
	 * on a reset, the workspaces the member held that the resetting administrator could not
	 * restore, because they hold no full credential on them themselves. Empty on an invitation.
	 */
	unreachableWorkspaces: { id: string; name: string }[];
};

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
	/**
	 * an organization on a Turso account the customer owns.
	 *
	 * Everything here spends a credential or makes one, so all of it is Rust's and the web layer
	 * observes outcomes ([[rules/credentials]], *Client boundary*).
	 */
	organization: {
		/** open the consent: a browser address to send the person to, and a session to poll. */
		consentBegin: () => Promise<OrganizationConsentStart>;
		/** how far the consent has got. Polled while `pending`. */
		consentResult: (sessionId: string) => Promise<OrganizationConsentResult>;
		/** forget the Turso authority this machine holds. Nothing is revoked at Turso. */
		disconnect: () => Promise<void>;
		/**
		 * create an organization on the consented account from the two things a first run
		 * collects. Refuses, creating nothing, where no consent has been granted, and signs the
		 * owner in where it succeeds.
		 */
		create: (name: string, password: string) => Promise<OrganizationCreated>;
		/** which organizations this machine has joined, and who is signed in. */
		getState: () => Promise<OrganizationState>;
		/**
		 * open a vault with a password, with or without a network. A wrong password rejects
		 * saying only that the value did not open; nothing distinguishes which half was wrong.
		 */
		signIn: (organizationId: string, password: string) => Promise<OrganizationState>;
		/** drop the keys this process held, and put the wall back up. */
		signOut: () => Promise<OrganizationState>;
		/**
		 * a `rentable://` link the operating system handed the process before the shell was
		 * listening: the one it was launched with, or one opened before the webview existed. Taken
		 * once; `null` where none is waiting.
		 */
		linkTake: () => Promise<string | null>;
		/** a link that arrives while the shell is running. Resolves to its own removal. */
		onLink: (listener: (link: string) => void) => Promise<Unlisten>;
		/**
		 * read a link: which organization it names and where its invitation stands. Rejects as
		 * `invalidInput` where the text is not a link, and as `network` where the organization
		 * could not be reached from a machine that has never seen it.
		 */
		linkInspect: (link: string) => Promise<LinkFacts>;
		/**
		 * join the organization a link names with the generated password the person was handed,
		 * and sign them in. A lapsed, revoked or used invitation rejects naming the organization;
		 * a wrong password rejects saying only that the value did not open.
		 */
		join: (link: string, password: string) => Promise<OrganizationState>;
		workspace: {
			/**
			 * create a workspace on the account: a database, migrated, recorded, and granted to the
			 * owner. Refuses anybody but the owner, before any request, and says to ask the owner.
			 */
			create: (name: string) => Promise<OrganizationWorkspace>;
			/**
			 * open a workspace this member holds a grant on: it becomes this machine's current
			 * workspace and its replica opens with the credential the vault unsealed. The credential
			 * stays on the other side.
			 */
			open: (workspaceId: string) => Promise<OrganizationWorkspace>;
			/** grant a workspace to a member, at `full-access` or `read-only`. */
			grant: (
				workspaceId: string,
				memberId: string,
				access: 'full-access' | 'read-only'
			) => Promise<void>;
			/** delete a workspace and its database: the owner's, and the one moment deletion is permitted. */
			remove: (workspaceId: string) => Promise<void>;
			/** mint fresh credentials for every grant and re-seal them, on the owner's machine. */
			renewCredentials: () => Promise<number>;
		};
		member: {
			/** every member, with names opened by the vault this process holds. */
			list: () => Promise<OrganizationMember[]>;
			/**
			 * invite a member: a row they will sign in to, a link, and a generated password, shown
			 * once. The application sends neither; the administrator hands them over.
			 */
			invite: (
				email: string,
				displayName: string,
				role: 'administrator' | 'member',
				workspaceIds: string[]
			) => Promise<Invited>;
			/**
			 * remove a member. `lockOut` false is the ordinary removal: their grants go, their row
			 * is signed as removed, and nobody else is disturbed; their credential works until it
			 * expires. `lockOut` true rotates every workspace they held, cutting them off at once
			 * and stopping every remaining member of those workspaces until their application
			 * collects a fresh credential. Neither reaches into what their machine already holds.
			 */
			remove: (memberId: string, lockOut: boolean) => Promise<MemberRemoved>;
			/** what locking a member out would cost, before it is done. */
			lockOutCost: (memberId: string) => Promise<LockOutCost>;
		};
		invitation: {
			list: () => Promise<OrganizationInvitation[]>;
			/** revoke an unused invitation; the link that named it opens nothing afterwards. */
			revoke: (invitationId: string) => Promise<void>;
		};
		/**
		 * reset a member's password: a fresh vault under a fresh generated password, everything
		 * the resetting administrator reaches re-sealed to it, and a fresh invitation. The answer
		 * names the workspaces it could not restore. The member's previous password is not needed
		 * and not learned.
		 */
		resetMember: (memberId: string) => Promise<Invited>;
		/**
		 * change the signed-in member's own password. The current one has to open the vault and
		 * the new one has to reach the floor; nothing else on the database moves, and what comes
		 * back is where the machine stands, with the requirement to change cleared.
		 */
		changePassword: (current: string, next: string) => Promise<OrganizationState>;
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
		 * reach the control plane with the identity this machine already holds, and say where that
		 * left it.
		 *
		 * **The retry for a sign-in that got half way.** Signing in with Google succeeds locally
		 * and the session is established best-effort after it, so a control plane that was
		 * unreachable leaves an identity with no session. Answering that with another sign-in
		 * opens a consent screen, answers it, and arrives back at the same missing session, which
		 * is why this repeats only the half that failed and opens no browser.
		 *
		 * Still unreachable is not a failure: the state comes back carrying no window, and the
		 * screen that called this says so.
		 */
		establishSession: () => Promise<RemoteSyncState>;
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
		/**
		 * call this machine's workspace something else, and say what that left it called.
		 *
		 * **The name belongs to the control plane rather than to this machine**, so this reaches
		 * it. Written locally instead, two machines signed in to one workspace would disagree
		 * about what it is called, which is a per-machine nickname rather than a rename, and the
		 * `renameWorkspace` permission would have nothing to guard.
		 *
		 * Answers with the state, so a caller reads the name it just set. Every surface that draws
		 * a workspace name reads one query, so one invalidation covers all three.
		 *
		 * A machine with no control plane behind it, no workspace it has signed in to, or no
		 * session, refuses rather than renaming locally. Each says which of the three it was.
		 */
		renameWorkspace: (name: string) => Promise<RemoteSyncState>;
	};
};
