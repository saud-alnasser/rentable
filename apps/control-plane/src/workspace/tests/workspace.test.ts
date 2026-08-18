import assert from 'node:assert/strict';
import test from 'node:test';

import { and, eq, sql } from 'drizzle-orm';

import type { Database } from '../../database/database.ts';

import { signInWithGoogle } from '../../account/account.ts';
import {
	CLIENT_OUT_OF_DATE,
	NO_SUCH_WORKSPACE,
	NOT_A_MEMBER,
	Refusal,
	SERVICE_OUT_OF_DATE
} from '../../failure.ts';
import { ADMINISTRATION_BY_ROLE, permits } from '../permission.ts';
import { membership, workspace } from '../../database/schema.ts';
import { freshDatabase, SOMEBODY, tursoInMemory, workspaceDatabases } from '../../tests/testing.ts';
import {
	migrateWorkspaceDatabase,
	MIGRATION_TOKEN_LIFETIME,
	targetSchemaVersion,
	type ConnectToWorkspaceDatabase
} from '../migration.ts';
import {
	createWorkspace,
	databaseNameFor,
	mintWorkspaceToken,
	TOKEN_LIFETIME
} from '../workspace.ts';

const AT = Date.UTC(2026, 7, 18, 12, 0, 0);

const SOMEBODY_ELSE = {
	...SOMEBODY,
	subject: 'google-subject-2',
	email: 'noura@example.com',
	displayName: 'Noura Saleh'
};

const aWorkspaceOwnedBySomebody = async (db: Database, turso: ReturnType<typeof tursoInMemory>) => {
	const owner = await signInWithGoogle(db, SOMEBODY, AT);
	const made = await createWorkspace(db, turso.platform, {
		accountId: owner.id,
		name: 'Riyadh',
		now: AT
	});

	return { owner, workspace: made };
};

/**
 * A workspace whose database has already been migrated to `version`.
 *
 * **The tests about membership are not about the schema**, and this is what keeps them that way:
 * the client asks at the version the workspace is already at, so nothing they do opens a database.
 * `0` used to serve that purpose and no longer can — it is the version a workspace is created at,
 * it means *no schema at all*, and the mint refuses it precisely so that no token is ever issued
 * for an empty database.
 */
const migratedTo = async (db: Database, workspaceId: string, version = AT_VERSION) => {
	await db.update(workspace).set({ schemaVersion: version }).where(eq(workspace.id, workspaceId));
};

/**
 * A mint that has nothing to migrate.
 *
 * **Zero is what a workspace is at the moment it is created**, so a client asking at zero is the
 * equal case — the one that mints and opens nothing. The tests below are about membership and
 * about the token; the schema is `tests/migration.test.ts`'s and the four cases are their own
 * tests at the foot of this file.
 */
const AT_VERSION = 1;

const nothingToMigrate: ConnectToWorkspaceDatabase = () => {
	throw new Error('the mint opened a workspace database when it had nothing to apply');
};

const refusalFrom = async (act: () => Promise<unknown>) => {
	const error = await act().then(
		() => null,
		(caught: unknown) => caught
	);

	assert.ok(error instanceof Refusal, `expected a refusal, got ${error}`);
	return error;
};

// Acceptance criterion 1, at the level where it is decided.
test('creating a workspace makes its database, its record, and its owner a member', async () => {
	const { db, close } = await freshDatabase();
	const turso = tursoInMemory();

	try {
		const { owner, workspace } = await aWorkspaceOwnedBySomebody(db, turso);

		assert.equal(workspace.ownerAccountId, owner.id);
		assert.equal(workspace.databaseName, databaseNameFor(workspace.id));
		assert.match(workspace.databaseHostname, /turso\.io$/);
		assert.deepEqual([...turso.databases], [databaseNameFor(workspace.id)]);

		const [belongs] = await db
			.select()
			.from(membership)
			.where(and(eq(membership.workspaceId, workspace.id), eq(membership.accountId, owner.id)));

		assert.ok(belongs, 'the owner is not a member of the workspace they made');
		assert.equal(belongs.role, 'owner');
		assert.equal(belongs.permissions, ADMINISTRATION_BY_ROLE.owner);
		assert.equal(permits(belongs.permissions, 'deleteWorkspace'), true);
	} finally {
		await close();
	}
});

// The database is created before the record naming it, so this is the window that has to close.
test('a database whose workspace could not be written is removed again', async () => {
	const { db, close } = await freshDatabase();
	const turso = tursoInMemory();

	try {
		// Nothing signed this account in, so the workspace's foreign key to it has nothing to
		// point at and the insert fails after the database already exists.
		await assert.rejects(
			createWorkspace(db, turso.platform, { accountId: 'never-signed-in', name: 'Riyadh', now: AT })
		);

		assert.equal(turso.deleted.length, 1, 'the database was left behind');
		assert.deepEqual([...turso.databases], [], 'the database is still there');
	} finally {
		await close();
	}
});

// The failure between the two writes, and it is worse than either alone: a workspace nobody is a
// member of is one nobody can reach and nobody can delete, and the cleanup would have removed its
// database while leaving the row that names it.
test('a workspace whose owner could not be made a member is not left behind', async () => {
	const { db, close } = await freshDatabase();
	const turso = tursoInMemory();

	try {
		const owner = await signInWithGoogle(db, SOMEBODY, AT);

		// The only way to fail the second write without touching the first.
		await db.run(sql`drop table membership`);

		await assert.rejects(
			createWorkspace(db, turso.platform, { accountId: owner.id, name: 'Riyadh', now: AT })
		);

		assert.deepEqual(await db.select().from(workspace), [], 'the workspace row survived');
		assert.deepEqual([...turso.databases], [], 'its database survived');
		assert.equal(turso.deleted.length, 1);
	} finally {
		await close();
	}
});

// Acceptance criterion 2: one database, and short-lived.
test('the mint asks Turso for that workspace database and no other', async () => {
	const { db, close } = await freshDatabase();
	const turso = tursoInMemory();

	try {
		const { owner, workspace } = await aWorkspaceOwnedBySomebody(db, turso);

		await migratedTo(db, workspace.id);

		const minted = await mintWorkspaceToken(db, turso.platform, nothingToMigrate, {
			workspaceId: workspace.id,
			accountId: owner.id,
			schemaVersion: AT_VERSION,
			now: AT
		});

		assert.deepEqual(turso.minted, [
			{ database: databaseNameFor(workspace.id), expiration: TOKEN_LIFETIME }
		]);
		assert.equal(minted.url, `libsql://${workspace.databaseHostname}`);
		assert.equal(minted.expiresAt, AT + 3 * 24 * 60 * 60 * 1000);
	} finally {
		await close();
	}
});

// Acceptance criterion 3, both halves.
test('a non-member is refused, and so is a workspace that does not exist', async () => {
	const { db, close } = await freshDatabase();
	const turso = tursoInMemory();

	try {
		const { owner, workspace } = await aWorkspaceOwnedBySomebody(db, turso);
		const stranger = await signInWithGoogle(db, SOMEBODY_ELSE, AT);

		await migratedTo(db, workspace.id);

		const outsider = await refusalFrom(() =>
			mintWorkspaceToken(db, turso.platform, nothingToMigrate, {
				workspaceId: workspace.id,
				accountId: stranger.id,
				schemaVersion: AT_VERSION,
				now: AT
			})
		);

		assert.equal(outsider.code, NOT_A_MEMBER);
		assert.equal(outsider.status, 403);

		const missing = await refusalFrom(() =>
			mintWorkspaceToken(db, turso.platform, nothingToMigrate, {
				workspaceId: 'no-such-workspace',
				accountId: owner.id,
				schemaVersion: AT_VERSION,
				now: AT
			})
		);

		assert.equal(missing.code, NO_SUCH_WORKSPACE);
		assert.equal(missing.status, 404);

		assert.deepEqual(turso.minted, [], 'a refused mint still asked Turso for a token');
	} finally {
		await close();
	}
});

/**
 * Acceptance criterion 4, and it is the whole reason removal is a bound this repository sets.
 *
 * Turso's own revocation is bulk-only and rotates every token in the group, with no published
 * propagation time (decision 01) — unusable for removing one person. Declining to renew is what
 * replaces it: per-user, effective at the next refresh, and bounded by the token lifetime.
 */
test('a removed member is declined at the next refresh, and nobody else is', async () => {
	const { db, close } = await freshDatabase();
	const turso = tursoInMemory();

	try {
		const { owner, workspace } = await aWorkspaceOwnedBySomebody(db, turso);
		const other = await signInWithGoogle(db, SOMEBODY_ELSE, AT);

		await migratedTo(db, workspace.id);

		await db.insert(membership).values({
			workspaceId: workspace.id,
			accountId: other.id,
			role: 'member',
			permissions: ADMINISTRATION_BY_ROLE.member,
			createdAt: new Date(AT),
			updatedAt: new Date(AT)
		});

		const asking = (accountId: string) =>
			mintWorkspaceToken(db, turso.platform, nothingToMigrate, {
				workspaceId: workspace.id,
				accountId,
				schemaVersion: AT_VERSION,
				now: AT
			});

		// Both are members, so both refresh.
		assert.ok(await asking(owner.id));
		assert.ok(await asking(other.id));

		// Removing somebody is removing their membership. Nothing is revoked and nothing
		// propagates; their next refresh simply finds no row.
		await db
			.delete(membership)
			.where(and(eq(membership.workspaceId, workspace.id), eq(membership.accountId, other.id)));

		const declined = await refusalFrom(() => asking(other.id));

		assert.equal(declined.code, NOT_A_MEMBER);
		assert.ok(await asking(owner.id), 'removing one member ended somebody else');
	} finally {
		await close();
	}
});

/**
 * Decision 06's three answers, and the fourth that falls out of them, are the rest of this file.
 *
 * The client says which schema version it was built against. Equal to the workspace's, it mints.
 * Newer, the workspace is migrated up to it first. Older, it is refused and holds no credential —
 * which is the whole point of refusing here rather than at the write.
 */
const aMintFor = async (
	db: Database,
	turso: ReturnType<typeof tursoInMemory>,
	connect: ConnectToWorkspaceDatabase,
	{ schemaVersion }: { schemaVersion: number }
) => {
	const { owner, workspace: made } = await aWorkspaceOwnedBySomebody(db, turso);

	return {
		owner,
		workspace: made,
		mint: () =>
			mintWorkspaceToken(db, turso.platform, connect, {
				workspaceId: made.id,
				accountId: owner.id,
				schemaVersion,
				now: AT
			})
	};
};

/**
 * The equal case, **at a version a client could actually send**.
 *
 * *It used to run at `0`, which is the version a workspace is created at and means "no schema at
 * all" — so it exercised the equal path at the one number no build produces and no mint accepts
 * any more. The workspace is brought to a real version by a real mint first, and the second mint
 * is the one under test.*
 *
 * The assertion that matters is the one about opening nothing: a workspace already at the client's
 * version costs one column read and no connection to its database.
 */
test('a client at the workspace version mints, and no database is opened', async () => {
	const { db, close } = await freshDatabase();
	const turso = tursoInMemory();
	const hosted = await workspaceDatabases();

	try {
		const target = await targetSchemaVersion();
		const { mint } = await aMintFor(db, turso, hosted.connect, { schemaVersion: target });

		// The first mint migrates, which is what puts the workspace at a version to be equal to.
		assert.ok((await mint()).token);

		const opened = hosted.opened.length;

		assert.ok((await mint()).token);
		assert.equal(
			hosted.opened.length,
			opened,
			'the mint opened a workspace database with nothing to do'
		);
	} finally {
		await hosted.close();
		await close();
	}
});

/**
 * The ordinary upgrade path, and the reason decision 06 put this at the mint: the first client to
 * arrive after a deploy pays for the migration, and it is by definition online.
 */
test('a client ahead of the workspace migrates it, then mints', async () => {
	const { db, close } = await freshDatabase();
	const turso = tursoInMemory();
	const hosted = await workspaceDatabases();

	try {
		const target = await targetSchemaVersion();
		const { workspace: made, mint } = await aMintFor(db, turso, hosted.connect, {
			schemaVersion: target
		});

		assert.ok((await mint()).token);

		const [record] = await db.select().from(workspace).where(eq(workspace.id, made.id));

		assert.equal(
			record?.schemaVersion,
			target,
			'the record does not say where its database got to'
		);

		const { rows } = await hosted
			.open(`libsql://${made.databaseHostname}`)
			.execute("select name from sqlite_master where type = 'table' and name = 'tenant'");

		assert.equal(rows.length, 1, 'the workspace database was never migrated');

		// Two tokens: the half-hour one this service opened the database with, and the client's.
		assert.deepEqual(
			turso.minted.map((one) => one.expiration),
			[MIGRATION_TOKEN_LIFETIME, TOKEN_LIFETIME]
		);
	} finally {
		await hosted.close();
		await close();
	}
});

/**
 * The refusal, and **no token is issued** — which is the acceptance criterion's own emphasis.
 *
 * An older client allowed to sync would replicate a schema it does not understand and then write
 * against columns it does not know about; by the time a write failed its replica would already
 * have diverged. Withholding the credential stops it before the first byte.
 */
test('a client behind the workspace is refused, told to update, and given nothing', async () => {
	const { db, close } = await freshDatabase();
	const turso = tursoInMemory();
	const hosted = await workspaceDatabases();

	try {
		const target = await targetSchemaVersion();
		const { workspace: made } = await aMintFor(db, turso, hosted.connect, { schemaVersion: 1 });

		// The workspace has moved on — swept ahead of this client, or migrated by a newer one.
		await db.update(workspace).set({ schemaVersion: target }).where(eq(workspace.id, made.id));

		const owner = await signInWithGoogle(db, SOMEBODY, AT);

		const refused = await refusalFrom(() =>
			mintWorkspaceToken(db, turso.platform, hosted.connect, {
				workspaceId: made.id,
				accountId: owner.id,
				schemaVersion: target - 1,
				now: AT
			})
		);

		assert.equal(refused.code, CLIENT_OUT_OF_DATE);
		assert.equal(refused.status, 409);
		assert.match(refused.message, /update the application/);
		assert.deepEqual(turso.minted, [], 'a refused client was handed a token anyway');
		assert.deepEqual(hosted.opened, [], 'a refused client had its workspace migrated anyway');
	} finally {
		await hosted.close();
		await close();
	}
});

/**
 * The fourth case, which decision 06 does not name and the mechanism produces anyway: a client
 * newer than anything this build ships a migration for.
 *
 * There is nothing to migrate *with*, and minting at this build's own version would hand a newer
 * client a database missing the columns it is about to write to — the same divergence, arriving
 * from the other side. It is this service that is behind, so it says so, and it says retry.
 */
test('a client ahead of what this build ships is refused, and it is this service that is behind', async () => {
	const { db, close } = await freshDatabase();
	const turso = tursoInMemory();
	const hosted = await workspaceDatabases();

	try {
		const { mint } = await aMintFor(db, turso, hosted.connect, {
			schemaVersion: (await targetSchemaVersion()) + 1
		});

		const refused = await refusalFrom(mint);

		assert.equal(refused.code, SERVICE_OUT_OF_DATE);
		assert.equal(refused.status, 503);
		assert.deepEqual(turso.minted, []);
		assert.deepEqual(hosted.opened, []);
	} finally {
		await hosted.close();
		await close();
	}
});

/**
 * Decision 06's named risk, pinned rather than designed away: a migration that fails leaves the
 * user unable to **sync**.
 *
 * What must not happen is the failure taking anything else with it — so the record still says
 * where the database actually is, and nothing was minted for the client.
 */
test('a workspace whose migration fails mints nothing, and its record still tells the truth', async () => {
	const { db, close } = await freshDatabase();
	const turso = tursoInMemory();

	try {
		const owner = await signInWithGoogle(db, SOMEBODY, AT);
		const made = await createWorkspace(db, turso.platform, {
			accountId: owner.id,
			name: 'Riyadh',
			now: AT
		});

		await assert.rejects(
			mintWorkspaceToken(
				db,
				turso.platform,
				() => {
					throw new Error('turso would not open that database');
				},
				{
					workspaceId: made.id,
					accountId: owner.id,
					schemaVersion: await targetSchemaVersion(),
					now: AT
				}
			)
		);

		const [record] = await db.select().from(workspace).where(eq(workspace.id, made.id));

		assert.equal(record?.schemaVersion, 0, 'the record claims a migration that never happened');
		assert.deepEqual(
			turso.minted.map((one) => one.expiration),
			[MIGRATION_TOKEN_LIFETIME],
			'a client token went out despite the migration failing'
		);
	} finally {
		await close();
	}
});

/**
 * **The refusal decided a second time, against the version the database actually reached.**
 *
 * *This is a regression test for a defect that shipped in this ticket's first commit and was
 * reproduced in review: an older client got a token.* The mint compared the client against the
 * workspace **record**, and that column can lag the database's own ledger — a sweep running while
 * a mint runs is the ordinary way there, and a process that died between applying a migration and
 * recording it is the other. A client above the stale number therefore passed the first test,
 * triggered a migration that applied nothing, corrected the column upward, and was handed a
 * credential for a schema it does not understand. Nothing in the suite would have noticed.
 */
test('a client the record says is ahead, but the database says is behind, is refused', async () => {
	const { db, close } = await freshDatabase();
	const turso = tursoInMemory();
	const hosted = await workspaceDatabases();

	try {
		const target = await targetSchemaVersion();
		const { owner, workspace: made } = await aWorkspaceOwnedBySomebody(db, turso);

		// The database is fully migrated — as a sweep would leave it — and the record is not,
		// which is exactly what a sweep whose own update failed leaves behind.
		await migrateWorkspaceDatabase(
			hosted.connect({ url: `libsql://${made.databaseHostname}`, authToken: 'a-token' }),
			target,
			{ database: made.databaseName }
		);
		await migratedTo(db, made.id, target - 2);

		const refused = await refusalFrom(() =>
			mintWorkspaceToken(db, turso.platform, hosted.connect, {
				workspaceId: made.id,
				accountId: owner.id,
				// Above the stale column, below what the database is actually at.
				schemaVersion: target - 1,
				now: AT
			})
		);

		assert.equal(refused.code, CLIENT_OUT_OF_DATE);
		assert.equal(refused.status, 409);
		assert.match(refused.message, /update the application/);
		assert.deepEqual(
			turso.minted.map((one) => one.expiration),
			[MIGRATION_TOKEN_LIFETIME],
			'an out-of-date client was handed a client token'
		);

		// And the column is corrected on the way past, so the next mint decides on the truth.
		const [record] = await db.select().from(workspace).where(eq(workspace.id, made.id));

		assert.equal(record?.schemaVersion, target);
	} finally {
		await hosted.close();
		await close();
	}
});

/**
 * The other half of the same defect: a migration that fails part-way records where it got to.
 *
 * A column left below the ledger is what lets the bypass above happen at all, so a failure that
 * leaves the two disagreeing is the failure to close. Here the third migration applies and the
 * fourth cannot, and the record says three — where it got to — rather than nothing.
 */
test('a migration that fails part-way records the version it reached', async () => {
	const { db, close } = await freshDatabase();
	const turso = tursoInMemory();
	const hosted = await workspaceDatabases();

	try {
		const { owner, workspace: made } = await aWorkspaceOwnedBySomebody(db, turso);
		const url = `libsql://${made.databaseHostname}`;

		// Applied to the database and unknown to the record: the state a crash mid-migration
		// leaves, manufactured without one.
		await migrateWorkspaceDatabase(hosted.connect({ url, authToken: 'a-token' }), 2, {
			database: made.databaseName
		});

		// `idmap` is 0003's first table, so putting one there in advance makes that file — and only
		// that file — fail. 0002 applies on the way, which is what leaves the database at 3.
		await db.run(sql`update workspace set schema_version = 0 where id = ${made.id}`);

		const client = hosted.open(url);
		await client.migrate([`CREATE TABLE idmap (a int)`]);

		await assert.rejects(
			mintWorkspaceToken(db, turso.platform, hosted.connect, {
				workspaceId: made.id,
				accountId: owner.id,
				schemaVersion: await targetSchemaVersion(),
				now: AT
			})
		);

		const [record] = await db.select().from(workspace).where(eq(workspace.id, made.id));

		assert.equal(record?.schemaVersion, 3, 'the record does not say where the database got to');
	} finally {
		await hosted.close();
		await close();
	}
});
