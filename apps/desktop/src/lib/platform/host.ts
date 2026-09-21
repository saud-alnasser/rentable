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
 * where an upgrade of a workspace's schema is, as the shell tells whoever is watching: this
 * client applying it under the lease, waiting on another member's lease until its deadline, or
 * done. The one moment the local replica is not enough, said rather than left to look like a hang.
 */
export type MigrationNotice = { workspaceId: string } & (
	| { phase: 'applying'; from: number; to: number }
	| { phase: 'waiting'; holderMemberId: string; until: number }
	| { phase: 'done' }
);

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
 * what a first run answers with: the organization's id, and whether the rows have reached Turso
 * yet. No key, no token, no password.
 *
 * *It carried the organization's own link until effort 828's requirement 16 retired it. The first
 * run hands out nothing now: an owner invites a member, and a member makes their own
 * second-machine link, each sealed under the code that came with it.*
 */
export type OrganizationCreated = {
	organizationId: string;
	synced: boolean;
};

/**
 * the one organization this machine holds, as the wall names it. No key.
 *
 * A machine that connected by the organization's link holds it and no member yet; a sign-in
 * fills `memberId` and `role`, and a sign-out keeps them. *`JoinedOrganization`, one of a list,
 * until 2026-09-13.*
 */
export type HeldOrganization = {
	id: string;
	name: string;
	/** this person's member row, once a sign-in has found it; `null` until then. */
	memberId: string | null;
	/** their role there, as last read. A display fact: what a member may do is what their vault holds. */
	role: string | null;
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
	/** the one thing that names this member; there is no address and no display name beside it. */
	username: string;
	role: string;
	permissions: number;
	workspaces: OrganizationWorkspace[];
	/** the owner's username: whom a member is told to tell when the account needs attention. */
	ownerUsername: string;
	/**
	 * whether this reader has been offered the organization and has not accepted yet (effort 828,
	 * requirement 22), which is what draws the acceptance in their account section. A fact about a
	 * standing offer and never the offer itself; who offered it is `ownerUsername`.
	 */
	ownershipOffered: boolean;
};

/**
 * which of the two kinds of link a text is, read from the text alone (effort 828, requirements 1
 * and 16). An invitation and a second machine's link each carry a payload nothing opens without
 * the code that came with it, and there is no third kind: the organization's own link carried a
 * legible credential and admitted a machine with no code, and it retired with requirement 16.
 * *It was a standing, `open | lapsed | consumed | revoked | none`, read off the row behind the
 * link; nothing reads a row before the credential is out, so where the row stands is judged by
 * the act that takes the code.*
 */
export type LinkKind = 'invitation' | 'machine';

/**
 * one workspace and the access held on it: what an invitation asks for, and what the members list
 * reports a member already holds.
 */
export type WorkspaceGrant = { id: string; access: 'full-access' | 'read-only' };

/** what a lock-out costs, said before it runs: which workspaces rotate, and how many members stop syncing. */
export type LockOutCost = {
	workspaces: { id: string; name: string; members: number }[];
	/** distinct members across every workspace above, other than the removed and the remover. */
	membersAffected: number;
};

/**
 * what ending a member's sessions did: whether the bump reached the organization database, or is
 * still waiting on this machine for a connection.
 *
 * The act's whole value is that it takes effect somewhere else, so "they were signed out" is only
 * true once the number has gone out; until then the other machines are still open and the next
 * heartbeat with a connection is what carries it.
 */
export type SessionsEnded = {
	sent: boolean;
};

/** what a removal did. */
export type MemberRemoved = {
	memberId: string;
	lockedOut: boolean;
	rotatedWorkspaceIds: string[];
	othersMustReconnect: number;
};

/**
 * what a link says about itself, read from its own text: which organization it names, which kind
 * of link it is, and when it lapses. No credential, no key, no secret, and no network: the link
 * was decoded in Rust and nothing behind it was reached.
 */
export type LinkShape = {
	organizationId: string;
	organizationName: string;
	kind: LinkKind;
	/** when the link lapses. Every link does. */
	expiresAt: number;
};

/**
 * what the turso account a consent was just granted over already holds (effort 828, requirement
 * 14). `empty` is the ordinary first run and the walk goes on to name the organization and create
 * it; `held` is an owner coming back to one that is already there, and the walk asks for their
 * username and password instead.
 */
export type GroupState = { kind: 'empty' } | { kind: 'held'; organizationId: string };

/**
 * where this machine stands: the one organization it holds, or none, and who is signed in.
 * What the sign-in wall admits on.
 */
export type OrganizationState = {
	/** the organization this machine holds; `null` on a machine that holds nothing. */
	organization: HeldOrganization | null;
	session: OrganizationSession | null;
	/**
	 * whether this machine holds the Turso authority and knows which account it is over: the
	 * owner's machine after a consent. An owner restored on a new machine holds none until they
	 * repeat the consent, which is the one thing a restore cannot bring with it.
	 */
	holdsTursoAuthority: boolean;
	/**
	 * whether the wall is up because this member's sessions were ended from another machine.
	 *
	 * Read only while the wall is up, and what it changes is the sentence on it: a person who was
	 * signed out from somewhere else is told so rather than shown the ordinary locked screen.
	 * False the moment anybody is signed in again.
	 */
	signedOutElsewhere: boolean;
};

/**
 * one member as the members list draws them. The username opened on the other side; no key, no
 * credential. *The workspaces were ids until effort 826, and the row carried the member's unspent
 * invitation beside them until effort 828 found nothing on this side reading it: where an account
 * stands is `MemberStanding`, read on its own.*
 */
export type OrganizationMember = {
	id: string;
	username: string;
	role: string;
	permissions: number;
	/** the workspaces this member holds, with the access on each. */
	workspaces: WorkspaceGrant[];
	createdAt: number;
	/**
	 * whether the organization has been offered to this account and not yet accepted (effort 828,
	 * requirement 22). One account carries it or none does, and it is what puts *withdraw the
	 * offer* on the owner's card in place of the offer.
	 */
	offeredOwnership: boolean;
};

/**
 * where one account stands, as the directory says it in a line (effort 828, requirement 19).
 *
 * **Two facts, and the three standings are read off the pair**: an account with no password of its
 * own, one nobody is signed in on, and one a machine is signed in on. The line is a fact about the
 * account and gates nothing: a link is made whichever of the three it reads.
 */
export type MemberStanding = {
	memberId: string;
	/** whether the account has a password of its own yet. `false` until its first link is opened. */
	passwordSet: boolean;
	/** whether a machine seen inside the presence window is signed in on the account. */
	machineSignedIn: boolean;
};

/**
 * the link and the code one act makes for an account (effort 828, requirement 20).
 *
 * **One shape for both kinds.** An account whose password is not yet set gets an invitation-kind
 * link and one that has a password gets a machine-kind link; what the person handing it over does
 * with either is the same, so this says nothing about which it is. The link is carried to the
 * other machine and the code is read out; neither is stored, and a person who lost the pair makes
 * another, which drops the one they lost.
 */
export type MadeLink = {
	link: string;
	/** six characters from the alphabet with the letters that read alike taken out. */
	code: string;
	/** the earlier of a week out and the moment the maker's own grant on the database dies. */
	expiresAt: number;
	/**
	 * the workspaces the link could not carry over, taken off the account's row: a grant the
	 * maker could not seal again for an account choosing its first password. Named so the maker
	 * is told rather than the person finding a workspace missing.
	 */
	unreachableWorkspaces: { id: string; name: string }[];
};

/**
 * a workspace a reset could not carry over, because the person resetting holds no full credential
 * on it themselves. The member waits on somebody who does.
 */
export type UnreachableWorkspace = {
	id: string;
	name: string;
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
		/** forget the Turso authority this machine holds, and nothing else. Nothing is revoked at Turso. */
		consentDisconnect: () => Promise<void>;
		/**
		 * create an organization on the consented account from the three things a first run
		 * collects. Refuses, creating nothing, where no consent has been granted, and signs the
		 * owner in where it succeeds.
		 *
		 * `group` is the Turso group the person picked on the consent screen, and it is `null` on
		 * every ordinary run: Rust tries the create with no group, then with Turso's own default,
		 * then with the group uuid the consent token carries, and the walk asks for a name only
		 * where all of those were refused. It is a name rather than a credential when it does
		 * arrive; a group that is not the consent's is refused before anything is created.
		 */
		create: (
			name: string,
			username: string,
			password: string,
			group: string | null
		) => Promise<OrganizationCreated>;
		/**
		 * what the consented turso account already holds, read after the consent and before
		 * anything is created (effort 828, requirement 14). A read: nothing is minted, nothing is
		 * created and this machine's record is untouched. Rejects as `notConfigured` where no
		 * consent has been granted.
		 */
		groupInspect: () => Promise<GroupState>;
		/**
		 * connect this machine to the organization the consented account already holds, and sign
		 * its owner in to it. Only the owner's password does it, because only their password
		 * re-derives the key the rows are judged against: anybody else rejects as `forbidden` and
		 * the machine is left holding nothing. A wrong username and a wrong password reject with
		 * the wall's one sentence, which tells them apart by nothing. Other machines holding the
		 * organization stand in nobody's way: the register is not read here, because an account is
		 * held on as many machines as its holder signs in on.
		 */
		connectExisting: (username: string, password: string) => Promise<OrganizationState>;
		/** the organization this machine holds, and who is signed in. */
		getState: () => Promise<OrganizationState>;
		/**
		 * forget the organization this machine holds: sign out where somebody is in, delete every
		 * replica on this machine, empty the record, and clear the Turso authority. The
		 * organization on Turso is untouched. The one confirm before it is the screen's.
		 */
		disconnect: () => Promise<OrganizationState>;
		/**
		 * delete the organization, with the owner's password: every workspace database and the
		 * organization's own directory are removed from the owner's Turso account, and this machine
		 * then forgets what it held exactly as a disconnect leaves it. Nothing puts either back.
		 * Rejects as `forbidden` for anybody but the owner and for a machine holding no Turso
		 * authority, and with the vault's one sentence for a password that does not open the
		 * owner's vault; nothing is deleted on either. Every other machine finds the organization
		 * gone at its next launch and forgets it too.
		 */
		delete: (password: string) => Promise<OrganizationState>;
		/**
		 * sign in to the organization this machine holds, by username and password, with or
		 * without a network. The wrong password, a username nobody holds, and a username held by
		 * somebody whose password this is not each reject with the same one sentence; nothing
		 * says whether the username exists. A first sign-in on a handed password spends the
		 * invitation, and the session still says to change the password.
		 */
		signIn: (username: string, password: string) => Promise<OrganizationState>;
		/** drop the keys this process held, and put the wall back up. */
		signOut: () => Promise<OrganizationState>;
		/**
		 * sign this member out of every machine but this one. Nothing asks for their password and
		 * nothing about it changes: what ends is the other machines' sessions and the keys they
		 * were staying signed in with. Each meets the wall at its next heartbeat or its next
		 * launch.
		 */
		sessionEndElsewhere: () => Promise<SessionsEnded>;
		/**
		 * a `rentable://` link the operating system handed the process before the shell was
		 * listening: the one it was launched with, or one opened before the webview existed. Taken
		 * once; `null` where none is waiting.
		 */
		linkTake: () => Promise<string | null>;
		/** a link that arrives while the shell is running. Resolves to its own removal. */
		onLink: (listener: (link: string) => void) => Promise<Unlisten>;
		/** where a workspace upgrade is, while one runs on open. Resolves to its own removal. */
		onMigration: (listener: (notice: MigrationNotice) => void) => Promise<Unlisten>;
		/**
		 * read a link: which organization it names, which kind of link it is, and when it lapses.
		 * A decode and nothing else, so it reaches no network and reads no row; rejects as
		 * `invalidInput` where the text is not a link, which a link in the shape before effort 828
		 * is.
		 */
		linkRead: (link: string) => Promise<LinkShape>;
		/**
		 * after an owner repeats the consent on a new machine: record which account it is over,
		 * so the machine can act as the owner's again. Rejects where no consent stands.
		 */
		reconnectAuthority: () => Promise<OrganizationState>;
		/**
		 * renew this organization's credentials if any is close to lapsing, on the owner's machine,
		 * best effort. Answers whether it renewed. A machine that is not the owner's, holds no
		 * authority, or has nothing due answers `false` and does nothing, so a caller fires it and
		 * forgets it; it never blocks sign-in, which works offline.
		 */
		renewDue: () => Promise<boolean>;
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
			/**
			 * take a workspace back from a member: the grant goes, and nothing is minted or
			 * rotated, so the credential they already hold works until it expires.
			 */
			withdraw: (workspaceId: string, memberId: string) => Promise<void>;
			/** delete a workspace and its database: the owner's, and the one moment deletion is permitted. */
			remove: (workspaceId: string) => Promise<void>;
			/** mint fresh credentials for every grant and re-seal them, on the owner's machine. */
			renewCredentials: () => Promise<number>;
		};
		member: {
			/** every member, with names opened by the vault this process holds. */
			list: () => Promise<OrganizationMember[]>;
			/**
			 * where each account stands: whether it has a password of its own yet, and whether a
			 * machine is signed in on it inside the presence window. Beside the list rather than on
			 * it, because the password is on the signed member row and the machine is on the
			 * register every machine writes for itself.
			 */
			standings: () => Promise<MemberStanding[]>;
			/**
			 * make an account: a row somebody will open, and no link. It holds no password until
			 * its first link is opened, which is `linkMake`. A read-only grant is minted on the
			 * owner's machine, and refused by name elsewhere.
			 */
			create: (
				username: string,
				role: 'administrator' | 'member',
				permissions: number,
				workspaces: WorkspaceGrant[]
			) => Promise<OrganizationMember>;
			/**
			 * make the one link that admits a machine to an account. The account's standing chooses
			 * the kind: one whose password is not yet set gets a link that asks the person to
			 * choose one, and one that has a password gets a link that lands the machine at the
			 * wall. No standing refuses it, and each link admits one more machine, once.
			 */
			linkMake: (memberId: string) => Promise<MadeLink>;
			/**
			 * unset a member's password: a fresh vault under a fresh secret, everything the
			 * resetting administrator reaches re-sealed to it, and the requirement to choose a
			 * password set, so the next link asks for one. The answer names the workspaces it
			 * could not restore, and the member's permissions are kept. The member's previous
			 * password is not needed and not learned.
			 */
			unsetPassword: (memberId: string) => Promise<UnreachableWorkspace[]>;
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
			/**
			 * change what a member is called and what they may do: both written on their row,
			 * re-signed, and their certificate issued or revoked to match. Nobody changes their own
			 * row or the owner's, and giving somebody an act that signs rows is the owner's.
			 */
			changeRole: (
				memberId: string,
				role: 'administrator' | 'member',
				permissions: number
			) => Promise<OrganizationMember>;
			/**
			 * offer the organization to another account: the first of the two acts a handover is
			 * (effort 828, requirement 22). Nothing about the organization moves, and the owner can
			 * take it back; the other person accepts on a machine of their own.
			 *
			 * The owner's alone, and their password is what performs it; a wrong one rejects
			 * before anything is written and nothing about it comes back. An account with no
			 * password of its own, a removed one and the caller's own row are each rejected by
			 * name.
			 */
			offerOwnership: (memberId: string, password: string) => Promise<OrganizationMember>;
			/**
			 * take the offer back: the offer and the seal it wrote both go. The owner's, and it
			 * asks for no password, because nothing is unsealed and what is undone is something
			 * this person did. Rejects where no offer stands.
			 */
			withdrawOffer: () => Promise<void>;
			/**
			 * sign a member out of every machine. Their password is not changed by it. Rejects the
			 * caller's own row, which is `sessionEndElsewhere`, and the owner's row, which is
			 * nobody else's to end.
			 */
			endSessions: (memberId: string) => Promise<SessionsEnded>;
			/**
			 * rename a member: their row written back with the username re-sealed and signed by
			 * whoever renamed them. The owner's or an administrator's, on any row but their own;
			 * the username is held to the rules and the uniqueness an invitation's is. What comes
			 * back is the member as the list shows them.
			 */
			rename: (memberId: string, username: string) => Promise<OrganizationMember>;
		};
		invitation: {
			/**
			 * open an invitation link, with the code the issuer read out and a password of the
			 * person's choosing: the code and the link's secret together unseal the credential and
			 * the vault password, the organization is reached and recorded where this machine
			 * holds none, the vault is resealed under the password, the invitation is spent, and
			 * the person is signed in. Rejects a lapsed link, a lapsed, consumed or revoked
			 * invitation by name as `forbidden`, a wrong code as `forbidden`, a missing code and a
			 * password under the floor as `invalidInput`, and a link for another organization than
			 * the one held as `preconditionFailed`.
			 */
			accept: (link: string, code: string, password: string) => Promise<OrganizationState>;
		};
		/**
		 * connect this machine with a machine-kind link, and land at the wall. The code
		 * and the link's secret together unseal the member's own grant, the organization is
		 * recorded with no member, and the link is spent. Rejects a wrong or missing code as
		 * `forbidden` and `invalidInput`, a lapsed link and a replaced or already spent one by
		 * name as `forbidden`, and a machine that already holds an organization as
		 * `preconditionFailed`.
		 */
		machineConnect: (link: string, code: string) => Promise<OrganizationState>;
		/**
		 * change the signed-in member's own password. The current one has to open the vault and
		 * the new one has to reach the floor; nothing else on the database moves, and what comes
		 * back is where the machine stands, with the requirement to change cleared.
		 */
		changePassword: (current: string, next: string) => Promise<OrganizationState>;
		/**
		 * accept the organization that was offered to this reader: the second of the two acts a
		 * handover is (effort 828, requirement 22). Their password becomes the organization's key,
		 * every certificate is re-issued under it, the roles swap, and this machine pins the new
		 * key. It runs on a machine the account is signed in on and nowhere else.
		 *
		 * Rejects where no offer stands, where the password does not open their vault, and where
		 * what was sealed onto their row is not the key this machine holds, which is what a seal
		 * somebody planted is. Nothing about the password or the key comes back; what does is
		 * where the machine stands, with this reader now the owner.
		 */
		ownershipAccept: (password: string) => Promise<OrganizationState>;
		/**
		 * Turso's own sentence about the standing account refusal, for the owner and nobody else:
		 * `null` for everybody else, and where nothing is refused.
		 */
		accountRefusalDetail: () => Promise<string | null>;
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
