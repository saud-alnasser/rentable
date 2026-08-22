import type { Role as PermissionRole } from '@rentable/workspace-permission';
import { relations } from 'drizzle-orm';
import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * The control plane's own database, and it holds nothing about the domain.
 *
 * A rents ledger — tenants, contracts, payments, units — lives in a workspace database that
 * this process never reads and never writes. What is here is who somebody is, which
 * workspaces exist, and who belongs to which: the three facts the credential path needs and
 * the data path does not. *Why it is a separate description rather than a second import of
 * `apps/desktop`'s schema: it describes different things. The monorepo effort's condition for
 * extracting the domain schema into a package is that a second consumer exists, and this is
 * not one — see the effort spec, `Data Model`.*
 *
 * **Foreign keys are declared here and are absent from the workspace schema.** That is not
 * an inconsistency to reconcile: the workspace database is replicated to machines that write
 * to it offline, so a constraint can be met on one replica and violated by the merge, while
 * this database is single and always online. Its migrations are also drizzle-kit's applied
 * by drizzle-kit, not the Rust runner that rejects a file containing a `PRAGMA`.
 */

/**
 * somebody Google vouched for.
 *
 * **The email is not unique, and that is the same rule as matching on `sub`.** *It was unique
 * until 2026-08-18, when #555 implemented the matching and the constraint turned out to say the
 * opposite.* An address can be freed and reassigned — a workspace domain giving a departed
 * employee's address to their replacement is the ordinary case — and the replacement is a
 * different Google subject, so they are a different person and a different row. A unique index
 * would refuse their first sign-in with a constraint violation, which is an email address
 * deciding who somebody is by the back door.
 *
 * Nothing looks an account up by email. It is stored because a person recognises themselves by
 * it, and it is refreshed from Google on every sign-in.
 */
export const account = sqliteTable('account', {
	id: text('id').primaryKey(),
	email: text('email').notNull(),
	displayName: text('display_name').notNull(),
	avatarUrl: text('avatar_url'),
	/**
	 * Google's `sub` — stable across an email change, which is the reason it is stored
	 * beside `email` rather than instead of it.
	 */
	googleUserId: text('google_user_id').notNull().unique(),
	createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
	updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
});

/**
 * A workspace the control plane knows about, and the database its data actually lives in.
 *
 * *The two database columns arrived with #556, which is what creates one.* They are not null,
 * which is a choice about failure rather than about the schema: creating a workspace creates
 * the database first and removes it again if the record cannot be written, so there is no
 * moment at which a workspace exists without one. A nullable pair would have made every reader
 * carry a state that only a crash produces.
 *
 * **`schemaVersion` is how far its database has been migrated, and it is this database's index of
 * a fact that lives in that one.** The authority is the hosted database's own `__migrations__`
 * ledger, written exactly as the Rust runner writes a local workspace's; this column is what the
 * mint compares against without opening a connection, and it is re-derived from the ledger
 * whenever a migration runs. A crash between applying a migration and updating it therefore
 * leaves a number that is too low, which costs one wasted look and corrects itself.
 */
export const workspace = sqliteTable('workspace', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	/**
	 * Who owns it, and **an account owns exactly one** — requirement 6, enforced here rather than
	 * only in the route that creates one.
	 *
	 * *Why the index and not just a check: the check loses a race, and two sign-ins arriving
	 * together for one new account is the ordinary way to lose it. The control plane runs as one
	 * process today and this does not rely on that.*
	 *
	 * **Requirement 14 reopens this by dropping the index**, in one migration, when organizations
	 * bring several workspaces per account. That is the whole cost of closing it now, and it is
	 * cheaper than the class of defect an unenforced invariant produces.
	 */
	ownerAccountId: text('owner_account_id')
		.notNull()
		.unique()
		.references(() => account.id),
	/** the database's name in the Turso organization. Every Platform API call names it by this. */
	databaseName: text('database_name').notNull().unique(),
	/** what a client syncs against, without a scheme — `libsql://` is prepended where it is used. */
	databaseHostname: text('database_hostname').notNull(),
	/**
	 * how many of the workspace migrations its database has had applied — `0` for one just
	 * created, which is every workspace at the moment its record is written.
	 */
	schemaVersion: integer('schema_version').notNull().default(0),
	createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
	updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
});

/**
 * That an account belongs to a workspace — and that is the whole of what it grants.
 *
 * **Membership grants full access to the workspace's data**, per decision 05, so there is no
 * column here saying which records a member may read. There could not usefully be one: a
 * member's client holds a replica it writes to offline, so the only place a per-record rule
 * could be enforced is a server that client is by definition not talking to.
 *
 * `permissions` therefore governs **administration** — inviting, removing, renaming — and
 * `@rentable/workspace-permission` is where the flags are defined and where the bit ceiling is
 * guarded. It is a package rather than a file here because the desktop names the same six acts,
 * and a copy on each side of the wire is a copy that drifts.
 */
export const membership = sqliteTable(
	'membership',
	{
		workspaceId: text('workspace_id')
			.notNull()
			.references(() => workspace.id),
		accountId: text('account_id')
			.notNull()
			.references(() => account.id),
		role: text('role', { enum: ['owner', 'administrator', 'member'] }).notNull(),
		permissions: integer('permissions').notNull().default(0),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
	},
	(table) => [primaryKey({ columns: [table.workspaceId, table.accountId] })]
);

/**
 * A sign-in that is still good, and the two windows it is measured by.
 *
 * **This is requirement 15's window, and it is a row here rather than a flag on the client.**
 * A client asserts nothing about how long ago it signed in: it presents what this table issued,
 * and what decides whether that is still good is `expires_at` against a clock this process
 * supplies. A window the client could decline to close is the shape the requirement rules out.
 *
 * **The token is stored as a SHA-256 digest and never as itself.** A session token is a bearer
 * credential — whoever holds it is the account — so a readable copy of every live one is the
 * worst row this database could carry. The digest answers the only question asked of it, which
 * is whether a presented token is one that was issued.
 *
 * **Two windows, and only one of them is renewed.** `expires_at` is the refresh window — how
 * much longer a client may go on working without reaching this process — and a reach moves it.
 * `absolute_expires_at` is set once, when the person signs in, and **nothing moves it**: past it a
 * real Google re-login is required however faithfully the client has been reaching the API. So
 * the gate on renewal is the absolute one, and the refresh window is what the *client* obeys —
 * a client that has been offline for four days still refreshes silently, which is exactly what
 * requirement 15 asks for and what a single sliding window could not give.
 *
 * **Renewing moves `expires_at` and keeps the token.** Rotating on every reach is the other
 * reasonable choice and it costs the client a stored write per request, for a property this
 * repository does not need: a session already dies of the window, and *declining to renew* is
 * how somebody is removed. `renewed_at` sits beside `created_at` because the two answer
 * different questions — when somebody signed in, and when they were last heard from — and the
 * window is measured from the second.
 */
export const session = sqliteTable('session', {
	id: text('id').primaryKey(),
	accountId: text('account_id')
		.notNull()
		.references(() => account.id),
	/** SHA-256 of the token, hex. Never the token, for the reason above. */
	tokenDigest: text('token_digest').notNull().unique(),
	createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
	/** the last successful reach. The window runs from here, not from `created_at`. */
	renewedAt: integer('renewed_at', { mode: 'timestamp_ms' }).notNull(),
	/** the refresh window. Moved by every reach, and what the client locks itself on. */
	expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
	/**
	 * the absolute lifetime. Set at sign-in and never moved, and the one renewal is gated on.
	 *
	 * A renewal that touched this would recreate the unbounded sliding window it exists to close,
	 * and nothing would fail — the test that catches it reaches every day for a month.
	 */
	absoluteExpiresAt: integer('absolute_expires_at', { mode: 'timestamp_ms' }).notNull()
});

export type Account = typeof account.$inferSelect;
export type Workspace = typeof workspace.$inferSelect;
export type Membership = typeof membership.$inferSelect;
export type Session = typeof session.$inferSelect;
export type Role = Membership['role'];

/**
 * The column and the package agree about what a role is.
 *
 * **This assertion is load-bearing, and what it costs at runtime is two `null` bindings.** A
 * purely type-level form would cost nothing at all and report `Type 'X' does not satisfy Y`; this
 * one reports `TS2322` naming the role that drifted, which is the message somebody debugging it
 * actually needs. `@rentable/workspace-permission`
 * declares its own `Role` union, because a package both applications depend on cannot depend on
 * either of them, and `ADMINISTRATION_BY_ROLE` is keyed by it. So the enum on the column above and
 * the union over there are two declarations of one thing, and nothing but these two lines notices
 * when they stop matching.
 *
 * It is bidirectional deliberately: assigning one way alone would let the other side grow a role
 * the column has never heard of. A role added to either and not the other fails `pnpm check` with
 * `TS2322` naming the role that drifted.
 */
const _theColumnIsInThePackage: PermissionRole = null as unknown as Role;
const _thePackageIsInTheColumn: Role = null as unknown as PermissionRole;
void _theColumnIsInThePackage;
void _thePackageIsInTheColumn;

// relations

export const accountRelations = relations(account, ({ many }) => ({
	owned: many(workspace),
	memberships: many(membership),
	sessions: many(session)
}));

export const workspaceRelations = relations(workspace, ({ one, many }) => ({
	owner: one(account, {
		fields: [workspace.ownerAccountId],
		references: [account.id]
	}),
	memberships: many(membership)
}));

export const membershipRelations = relations(membership, ({ one }) => ({
	workspace: one(workspace, {
		fields: [membership.workspaceId],
		references: [workspace.id]
	}),
	account: one(account, {
		fields: [membership.accountId],
		references: [account.id]
	})
}));

export const sessionRelations = relations(session, ({ one }) => ({
	account: one(account, {
		fields: [session.accountId],
		references: [account.id]
	})
}));
