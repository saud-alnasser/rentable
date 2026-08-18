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
	ownerAccountId: text('owner_account_id')
		.notNull()
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
 * `./permission.ts` is where the flags are defined and where the bit ceiling is guarded.
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

export type Account = typeof account.$inferSelect;
export type Workspace = typeof workspace.$inferSelect;
export type Membership = typeof membership.$inferSelect;
export type Role = Membership['role'];

// relations

export const accountRelations = relations(account, ({ many }) => ({
	owned: many(workspace),
	memberships: many(membership)
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
