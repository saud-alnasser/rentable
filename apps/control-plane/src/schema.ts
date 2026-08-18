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

/** somebody Google vouched for. What signing in *does* is #555's; this is what it writes to. */
export const account = sqliteTable('account', {
	id: text('id').primaryKey(),
	email: text('email').notNull().unique(),
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
 * A workspace the control plane knows about.
 *
 * **Where its data actually lives is deliberately not here yet.** The database this record
 * points at is created by #556 and the schema version it carries is #557's, and both are
 * columns on this table when those tickets add them. A record with a `libsql://` hostname on
 * it before anything creates one would be a column that is null on every row.
 */
export const workspace = sqliteTable('workspace', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	ownerAccountId: text('owner_account_id')
		.notNull()
		.references(() => account.id),
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
