/**
 * ORGANIZATION HOST
 *
 * what the organization asks of the shell it runs in, and the payload types it speaks in: the
 * organization feature's port. `./tauri` is its Tauri adapter, and `$lib/app/host` composes it
 * into the application's `Host` beside the platform's own part and every other feature's port.
 *
 * Nothing in this file imports a `@tauri-apps` package, for the reason `$lib/platform/host`
 * gives: a client that is not the Tauri shell has to be able to read the port without the facade.
 */

import type { RoleKind } from '@rentable/workspace-permission';

import type { Unlisten } from '$lib/platform/host';

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
	/**
	 * the kind of their role there, as last read. A display fact: what a member may do is what
	 * their vault holds. `null` until a sign-in records it. *It was a word, `administrator` for a
	 * manager and `removed` for a removed member, until ticket 15 of effort 838.*
	 */
	role: RoleKind | null;
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
	/**
	 * the record flags pinned for this member in this workspace, whatever they hold across the
	 * organization (effort 838, requirement 12 as amended a third time, and at review round one).
	 * `0` where nothing is.
	 */
	pinned: number;
	/** which of the pinned flags are on; the rest of them are off. */
	granted: number;
	/**
	 * what this member may do in this workspace before the grant is read: their permissions across
	 * the organization with what is pinned set as it is granted, which `effectiveInWorkspace`
	 * computes from the same three. A read-only grant clears the writes of it, which `effectiveIn`
	 * folds.
	 */
	permissions: number;
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
	/** the kind of the role this member holds. *It was the word `administrator` for a manager.* */
	role: RoleKind;
	/** the role their row names, by id. */
	roleId: string;
	/** a custom role's name; empty on the three built-in roles, which the interface names. */
	roleName: string;
	/** how high the role stands. */
	rank: number;
	/** the flags switched for this member alone. `0` on the owner's row. */
	override: number;
	/**
	 * what this member may do across the organization: their role's mask with their override
	 * switched, read off the verified row. **Not yet what they may do in a workspace**: that is
	 * the workspace's own `permissions`, and a read-only grant clears the writes there, which
	 * `effectiveIn` folds for the workspace open. This still answers for administration.
	 */
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

/**
 * one workspace a member is in, as the members list draws them: the access their grant holds, and
 * what is pinned for them there (effort 838, requirement 12 as amended a third time, and at review
 * round one).
 */
export type MemberWorkspace = WorkspaceGrant & {
	/** the record flags pinned for them in this workspace. `0` where nothing is. */
	pinned: number;
	/** which of the pinned flags are on; the rest of them are off. */
	granted: number;
	/** what they may do there before the grant is read: their permissions with the pins set. */
	permissions: number;
};

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
	/** the kind of the role this member holds. *It was the word `administrator` for a manager.* */
	role: RoleKind;
	/** the role their row names, by id. */
	roleId: string;
	/** a custom role's name; empty on the three built-in roles, which the interface names. */
	roleName: string;
	/** how high the role stands. */
	rank: number;
	/** the flags switched for this member alone. `0` on the owner's row. */
	override: number;
	/** what this member may do: their role's mask with their override switched. */
	permissions: number;
	/** the workspaces this member holds, with the access on each and what is pinned there. */
	workspaces: MemberWorkspace[];
	createdAt: number;
	/**
	 * whether the organization has been offered to this account and not yet accepted (effort 828,
	 * requirement 22). One account carries it or none does, and it is what puts *withdraw the
	 * offer* on the owner's card in place of the offer.
	 */
	offeredOwnership: boolean;
};

/**
 * one role as the settings area lists it (effort 838, requirement 12): the owner's, then every
 * role row, highest rank first. No certificate crosses with it.
 */
export type OrganizationRole = {
	id: string;
	kind: RoleKind;
	/** a custom role's name; empty on the three built-in roles, which the interface names. */
	name: string;
	/** what the role carries, as one number. Never read as a number: `permits` answers for it. */
	mask: number;
	/** how high the role stands. A custom role stands strictly between the member and the manager. */
	rank: number;
	/** how many members still in hold it. */
	holders: number;
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

/** The organization's mark as the host hands it over: its kind, and the image in base64. */
export type OrganizationMark = { mediaType: string; data: string };

/**
 * an organization on a Turso account the customer owns.
 *
 * Everything here spends a credential or makes one, so all of it is Rust's and the web layer
 * observes outcomes ([[rules/credentials]], *Client boundary*).
 */
export type OrganizationHost = {
	/** the organization's mark, a signature or a seal, or nothing where none is set. */
	markGet: () => Promise<OrganizationMark | null>;
	/** keep the image at `path` as the mark: read, checked and sealed by the host. */
	markSet: (path: string) => Promise<OrganizationMark>;
	/** remove the mark. */
	markClear: () => Promise<void>;
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
	 * created and this machine's record is untouched. Refuses with `tursoNotConnected` where no
	 * consent has been granted.
	 */
	groupInspect: () => Promise<GroupState>;
	/**
	 * connect this machine to the organization the consented account already holds, and sign
	 * its owner in to it. Only the owner's password does it, because only their password
	 * re-derives the key the rows are judged against: anybody else is refused with `ownerOnly`
	 * and the machine is left holding nothing. A wrong username and a wrong password reject with
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
	 * Refuses with `ownerOnly` for anybody but the owner and `ownerMachineOnly` for a machine
	 * holding no Turso authority, and with the vault's one sentence for a password that does not open the
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
	 * A decode and nothing else, so it reaches no network and reads no row; refuses with
	 * `linkUnreadable` where the text is not a link, which a link in the shape before effort
	 * 828 is.
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
	/**
	 * every role, highest rank first, with what each carries and how many hold it. Any
	 * signed-in member reads it; a custom role's name is opened on the other side.
	 */
	roles: () => Promise<OrganizationRole[]>;
	/**
	 * the organization's own roles (effort 838, requirement 4). Each is `manageRoles`'s, on a role
	 * ranked below the caller's, and a mask may carry only flags the caller holds and none of the
	 * owner's; Rust refuses each by name. What comes back is the role as the list reads it.
	 */
	role: {
		/** make a custom role, named and carrying `mask`, directly below `afterRoleId`. */
		create: (name: string, mask: number, afterRoleId: string) => Promise<OrganizationRole>;
		/** rename a custom role; the three every organization has keep their names. */
		rename: (roleId: string, name: string) => Promise<OrganizationRole>;
		/** change what a role carries: the manager's, the member's or a custom one, never the owner's. */
		setMask: (roleId: string, mask: number) => Promise<OrganizationRole>;
		/** move a custom role to directly below `afterRoleId`, the manager or another custom role. */
		move: (roleId: string, afterRoleId: string) => Promise<OrganizationRole>;
		/**
		 * delete a custom role; everybody who held it holds the member role from here on, exactly:
		 * the override they carried is cleared (effort 838, requirement 6 as amended 2026-09-27).
		 */
		remove: (roleId: string) => Promise<void>;
	};
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
			roleId: string,
			override: number,
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
		 * resetting member reaches re-sealed to it, and the requirement to choose a
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
		 * give a member a role: their row names it, re-signed, and their certificate is issued
		 * again from the caller's to match. `assignRole`, on a member and a role both ranked below
		 * the caller, never their own row, and only where every flag the change moves is one the
		 * caller holds. The owner's role is never assigned; it is handed over.
		 *
		 * `override`, where given, is set in the same act, so the flags the change moves are the
		 * ones the role and the override move together rather than each on its own; one that is
		 * not zero is held to `overrideMember` as well. Left out, the override they carried is
		 * cleared, so they hold the role exactly (effort 838, requirement 6 as amended 2026-09-27).
		 */
		assignRole: (
			memberId: string,
			roleId: string,
			override?: number
		) => Promise<OrganizationMember>;
		/**
		 * set a member's override: the flags switched for them alone, against their role's mask.
		 * `overrideMember`, on the same lines as `assignRole`; the owner carries none.
		 */
		setOverride: (memberId: string, override: number) => Promise<OrganizationMember>;
		/**
		 * set what is pinned for a member in one workspace they are in, and which of it is on:
		 * record flags only, `granted` within `pinned`, whatever they hold across the
		 * organization, and nothing pinned clears it (effort 838, requirement 12 as amended a
		 * third time, and at review round one). `overrideMember`, on the same lines as
		 * `setOverride`, every flag pinned one the reader holds, and nothing written there that
		 * they cannot view.
		 */
		setWorkspaceOverride: (
			memberId: string,
			workspaceId: string,
			pinned: number,
			granted: number
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
		 * whoever renamed them. Open to a holder of `renameMember`, on a row below their rank;
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
		 * the person is signed in. Refuses a lapsed link and a lapsed, consumed or revoked
		 * invitation by name, a wrong code with `codeWrong`, a missing code with `codeMissing`,
		 * a password under the floor with `passwordTooShort`, and a link for another
		 * organization than the one held with `anotherOrganizationHeld`.
		 */
		accept: (link: string, code: string, password: string) => Promise<OrganizationState>;
	};
	/**
	 * connect this machine with a machine-kind link, and land at the wall. The code
	 * and the link's secret together unseal the member's own grant, the organization is
	 * recorded with no member, and the link is spent. Refuses a wrong or missing code with
	 * `codeWrong` and `codeMissing`, a lapsed link and a replaced or already spent one by
	 * name, and a machine that already holds an organization with `anotherOrganizationHeld`.
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
