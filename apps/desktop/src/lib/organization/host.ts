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

import type {
	LockOutCost,
	MadeLink,
	MemberHost,
	MemberRemoved,
	MemberStanding,
	MemberWorkspace,
	OrganizationMember,
	UnreachableWorkspace,
	WorkspaceGrant
} from './member/host';
import type { OrganizationRole, RoleHost } from './role/host';
import type { OrganizationWorkspace, WorkspaceHost, WorkspaceStatement } from './workspace/host';

/**
 * The payload types a sub-concept's part of the port speaks in, named here as well, where every
 * caller has always read them: the port is one, whichever part of it a type belongs to.
 */
export type {
	LockOutCost,
	MadeLink,
	MemberRemoved,
	MemberStanding,
	MemberWorkspace,
	OrganizationMember,
	OrganizationRole,
	OrganizationWorkspace,
	UnreachableWorkspace,
	WorkspaceGrant,
	WorkspaceStatement
};

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
 * one organization this machine holds, as the wall and its switcher name it. No key.
 *
 * A machine that connected by a link holds it and no member yet; a sign-in fills `memberId` and
 * `role`, and a sign-out keeps them. *`JoinedOrganization`, one of a list, until 2026-09-13, and
 * the one organization a machine held from then until effort 851 made it one of a list again.*
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
	/**
	 * whether this machine holds this organization's own Turso consent (effort 851, requirement
	 * 14), which is what its remove confirm says it forgets (requirement 5), and nothing else.
	 */
	holdsTursoAuthority: boolean;
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
	 * whether this member is locked until an owner or a manager unlocks them (effort 851,
	 * requirement 32), off their signed lock as it reads now. A locked member signs in, changes
	 * their password and views; every other act of the organization is refused in Rust
	 * (`locked`), and the interface masks their permissions to the view flags.
	 */
	locked: boolean;
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

/**
 * one machine signed in as the reader, as their account section lists it (effort 846,
 * requirement 9): facts about a machine and never a credential ([[rules/credentials]], *Client
 * boundary*).
 */
export type MachineView = {
	/** its id in the organization's registry, which the sign-out names it by. Never drawn. */
	id: string;
	/**
	 * what its operating system calls it, or `null` on a machine that has not named itself yet;
	 * the interface writes a fallback with the date it was added, never the id.
	 */
	name: string | null;
	/** when it last said it was here: a sign-in, a launch, or the hourly heartbeat. */
	seenAt: number;
	/** when it joined the organization. */
	createdAt: number;
	/** whether it is the machine this list was read on, which is listed first. */
	isThisMachine: boolean;
	/**
	 * whether it can be signed out on its own: another of the reader's machines that has run this
	 * version. One that has not would not read the sign-out, and *sign out all other machines* is
	 * what reaches it (requirement 10).
	 */
	mayEndAlone: boolean;
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
 * where this machine stands: the organizations it holds, the one the wall opens on, and who is
 * signed in. What the sign-in wall admits on.
 */
export type OrganizationState = {
	/**
	 * every organization this machine holds, in the order it came to hold them (effort 851,
	 * requirement 3); empty on a machine that holds nothing, which is the welcome. *It was
	 * `organization`, the one a machine held, until effort 851's ticket 08.*
	 */
	organizations: HeldOrganization[];
	/**
	 * the id of the organization the wall opens on: the one last signed in to, or chosen at the
	 * switcher (requirement 2). `null` where nothing is held.
	 */
	selected: string | null;
	session: OrganizationSession | null;
	/**
	 * whether this machine holds the Turso authority over the selected organization and knows
	 * which account it is over: the owner's machine after a consent. An owner restored on a new machine holds none until they
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
	/**
	 * forget the pending Turso consent the setup walk holds, and nothing else; an organization's own
	 * is `forgetAuthority`'s. Nothing is revoked at Turso.
	 */
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
	/** the organizations this machine holds, the one chosen, and who is signed in. */
	getState: () => Promise<OrganizationState>;
	/**
	 * forget the organization this machine has open, or the one the wall stands on: sign out
	 * where somebody is in, delete its replica and its workspaces' replicas, forget its entry,
	 * and clear its Turso consent. Every other organization held keeps all of its own. The
	 * organization on Turso is untouched. The one confirm before it is the screen's.
	 */
	disconnect: () => Promise<OrganizationState>;
	/**
	 * choose the organization the wall opens on, from those this machine holds (effort 851,
	 * requirement 3). Refuses with `sessionOpen` while somebody is signed in, since switching
	 * happens signed out, and with `noOrganization` for an organization this machine does not
	 * hold.
	 */
	select: (organizationId: string) => Promise<OrganizationState>;
	/**
	 * forget one organization this machine holds and nothing else (effort 851, requirement 5):
	 * its replica, its workspaces' replicas, its remembered sign-in, its entry and its Turso
	 * consent. Where it is the open one the machine signs out of it first; removing another
	 * leaves the open one open. Refuses with `noOrganization` for one this machine does not
	 * hold. The one confirm before it is the screen's.
	 */
	remove: (organizationId: string) => Promise<OrganizationState>;
	/**
	 * rename the organization, as its owner (effort 851, requirements 22 to 28): trimmed, sealed
	 * and signed by Rust, written to the signed name and the unsigned column, and sent. Answers
	 * the whole state, so the tab, the shell and the switcher read the new name at once. Refuses
	 * with `ownerOnly` for anybody else, and with `organizationNameMissing` or
	 * `organizationNameTooLong` for a name outside the walk's rules; nothing is written on any.
	 */
	rename: (name: string) => Promise<OrganizationState>;
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
	 * sign in to the organization chosen on this machine, by username and password, with or
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
	 * every machine signed in as the reader, this one first and then the one most lately seen,
	 * however long ago each was seen (effort 846, requirement 9). Another member's are never in it.
	 */
	machines: () => Promise<MachineView[]>;
	/**
	 * sign one of the reader's other machines out, and stay signed in here (effort 846,
	 * requirement 10). Refuses this machine (`notYourself`), one not signed in as the reader
	 * (`machineMissing`) and one that has not run this version (`machineNotUpdated`). What comes
	 * back is whether the sign-out reached the organization database, as `sessionEndElsewhere`'s
	 * does.
	 */
	endMachine: (machineId: string) => Promise<SessionsEnded>;
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
	 * forget the open organization's own Turso consent and the account it was over, from the
	 * owner's leaving card. Nothing is revoked at Turso; the pending consent a setup holds and every
	 * other organization's are left alone.
	 */
	forgetAuthority: () => Promise<OrganizationState>;
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
	role: RoleHost;
	/** the workspaces, as `./workspace/host.ts` says of each act. */
	workspace: WorkspaceHost;
	/** accounts and their invitations, as `./member/host.ts` says of each act. */
	member: MemberHost;
	invitation: {
		/**
		 * open an invitation link, with the code the issuer read out and a password of the
		 * person's choosing: the code and the link's secret together unseal the credential and
		 * the vault password, the organization is reached and recorded beside any others this
		 * machine holds and selected, the vault is resealed under the password, the invitation is
		 * spent, and the person is signed in. A link for an organization this machine holds
		 * selects it and is judged there: a reset link for one of its members goes through, and
		 * anything else is refused as `consumed`. Refuses a lapsed link and a
		 * lapsed, consumed or revoked invitation by name, a wrong code with `codeWrong`, a missing
		 * code with `codeMissing`, and a password under the floor with `passwordTooShort`.
		 */
		accept: (link: string, code: string, password: string) => Promise<OrganizationState>;
	};
	/**
	 * connect this machine with a machine-kind link, and land at the wall. The code
	 * and the link's secret together unseal the member's own grant, the organization is
	 * recorded with no member beside any others held and selected, and the link is spent. A
	 * link for an organization this machine holds selects it and is refused as `consumed`. Refuses a
	 * wrong or missing code with `codeWrong` and `codeMissing`, and a lapsed link and a
	 * replaced or already spent one by name.
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
