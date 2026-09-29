/**
 * THE MEMBERS' PART OF THE ORGANIZATION HOST
 *
 * what the organization asks of the shell about its accounts, and the payload types it speaks in
 * about them. Composed into the organization's port, `OrganizationHost` in `../host.ts`, which
 * re-exports these types; `../tauri.ts` is the adapter for the whole port.
 *
 * Nothing in this file imports a `@tauri-apps` package, for the reason `$lib/platform/host` gives.
 */

import type { RoleKind } from '@rentable/workspace-permission';

import type { SessionsEnded } from '$lib/organization/host';

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

/** what a removal did. */
export type MemberRemoved = {
	memberId: string;
	lockedOut: boolean;
	rotatedWorkspaceIds: string[];
	othersMustReconnect: number;
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

/** accounts and their invitations, which is the members section. */
export type MemberHost = {
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
	assignRole: (memberId: string, roleId: string, override?: number) => Promise<OrganizationMember>;
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
