/**
 * THE WORKSPACES' PART OF THE ORGANIZATION HOST
 *
 * what the organization asks of the shell about its workspaces, and the workspace it speaks in.
 * Composed into the organization's port, `OrganizationHost` in `../host.ts`, which re-exports these
 * types; `../tauri.ts` is the adapter for the whole port.
 *
 * Nothing in this file imports a `@tauri-apps` package, for the reason `$lib/platform/host` gives.
 */

import type { Row } from '$lib/platform/database/client';

/** one statement run on a workspace that is not open: its text and its values, as a replica's. */
export type WorkspaceStatement = { sql: string; params: unknown[] };

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
	/**
	 * when the workspace was made, in milliseconds since the epoch, off its row in the
	 * organization store (effort 846, ticket 33). The shell always answers it; it is optional
	 * because a workspace built by hand, as a test builds one, need not say, and the card then
	 * draws no date rather than a wrong one.
	 */
	createdAt?: number;
};

/** a workspace: created by the owner, opened by whoever holds a grant, granted and taken back. */
export type WorkspaceHost = {
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
	/**
	 * run one statement on a workspace this member holds a grant on, directly on Turso, whether or
	 * not it is open on this machine, and answer its rows as the open replica's transport does
	 * (effort 846, requirement 15). Nothing is opened, switched or written to this machine; the
	 * shell names the host and holds the credential, so the caller names the workspace alone.
	 * Refuses a workspace with no grant, one of a newer or an older schema, and an unreachable
	 * Turso, naming the workspace.
	 */
	query: (workspaceId: string, query: WorkspaceStatement) => Promise<Row[]>;
	/**
	 * run several statements on such a workspace as one transaction, all of them or none kept, and
	 * answer each one's rows. Otherwise as `query`.
	 */
	batch: (workspaceId: string, queries: WorkspaceStatement[]) => Promise<Row[][]>;
};
