import assert from 'node:assert/strict';
import test from 'node:test';

import { and, eq, sql } from 'drizzle-orm';

import { signInWithGoogle } from './account.ts';
import { NO_SUCH_WORKSPACE, NOT_A_MEMBER, Refusal } from './failure.ts';
import { ADMINISTRATION_BY_ROLE, permits } from './permission.ts';
import { membership, workspace } from './schema.ts';
import { freshDatabase, SOMEBODY, tursoInMemory } from './testing.mjs';
import {
	createWorkspace,
	databaseNameFor,
	mintWorkspaceToken,
	TOKEN_LIFETIME
} from './workspace.ts';

const AT = Date.UTC(2026, 7, 18, 12, 0, 0);

const SOMEBODY_ELSE = {
	...SOMEBODY,
	subject: 'google-subject-2',
	email: 'noura@example.com',
	displayName: 'Noura Saleh'
};

/**
 * @param {import('./database.ts').Database} db
 * @param {ReturnType<typeof tursoInMemory>} turso
 */
const aWorkspaceOwnedBySomebody = async (db, turso) => {
	const owner = await signInWithGoogle(db, SOMEBODY, AT);
	const made = await createWorkspace(db, turso.platform, {
		accountId: owner.id,
		name: 'Riyadh',
		now: AT
	});

	return { owner, workspace: made };
};

/** @param {() => Promise<unknown>} act */
const refusalFrom = async (act) => {
	const error = await act().then(
		() => null,
		(/** @type {unknown} */ caught) => caught
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
		const minted = await mintWorkspaceToken(db, turso.platform, {
			workspaceId: workspace.id,
			accountId: owner.id,
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

		const outsider = await refusalFrom(() =>
			mintWorkspaceToken(db, turso.platform, {
				workspaceId: workspace.id,
				accountId: stranger.id,
				now: AT
			})
		);

		assert.equal(outsider.code, NOT_A_MEMBER);
		assert.equal(outsider.status, 403);

		const missing = await refusalFrom(() =>
			mintWorkspaceToken(db, turso.platform, {
				workspaceId: 'no-such-workspace',
				accountId: owner.id,
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

		await db.insert(membership).values({
			workspaceId: workspace.id,
			accountId: other.id,
			role: 'member',
			permissions: ADMINISTRATION_BY_ROLE.member,
			createdAt: new Date(AT),
			updatedAt: new Date(AT)
		});

		const asking = (/** @type {string} */ accountId) =>
			mintWorkspaceToken(db, turso.platform, { workspaceId: workspace.id, accountId, now: AT });

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
