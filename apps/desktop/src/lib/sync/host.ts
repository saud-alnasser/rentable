import type { HeldByVersion } from '$lib/organization';

/**
 * SYNC HOST
 *
 * what remote sync asks of the shell it runs in, the payload types it speaks in, and the bound on
 * the name its rename takes: the sync feature's port. `./tauri` is its Tauri adapter, and `$lib/app/host` composes it into the
 * application's `Host` under `sync`.
 *
 * Nothing in this file imports a `@tauri-apps` package, for the reason `$lib/platform/host`
 * gives: a client that is not the Tauri shell has to be able to read the port without the facade.
 */

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

/** what remote sync may ask of the shell: this machine's workspace and its replication. */
export type SyncHost = {
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
		/**
		 * what holds this machine by its version after it, or `null` where this build may write
		 * both the organization and the open workspace (effort 857). Judged after the
		 * organization's pull and before anything went out: a workspace held read-only was pulled
		 * and not pushed, and one past reading was neither.
		 */
		heldByVersion: HeldByVersion | null;
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

/**
 * How long a workspace's name may be.
 *
 * **The organization store is the authority and this is a copy of its number**, which is worth stating
 * because a copy across a boundary is a thing that drifts. It is here so a name too long to store
 * is refused before a round trip rather than after one, and so the form can say so beside the
 * field the reader typed in. The service still decides what it stores; nothing here can make it
 * accept a name it would not.
 *
 * *The column itself has no length on it (`workspace.name` is SQLite `TEXT`), so what this bounds
 * is a name no surface can draw rather than one the row cannot hold.*
 *
 * Here beside the port that renames, whose router refuses a name over it, since effort 840: it sat
 * in `$lib/workspace/workspace` until then, and the router importing it from there kept sync and
 * the workspace importing each other.
 */
export const WORKSPACE_NAME_LIMIT = 120;
