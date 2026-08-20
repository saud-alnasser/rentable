import assert from 'node:assert/strict';
import test from 'node:test';

import { eq } from 'drizzle-orm';

import { signInWithGoogle } from '../../account/account.ts';
import { workspace } from '../../database/schema.ts';
import { freshDatabase, SOMEBODY, tursoInMemory, workspaceDatabases } from '../../tests/testing.ts';
import { targetSchemaVersion, type ConnectToWorkspaceDatabase } from '../migration.ts';
import { sweepWorkspaceSchemas } from '../sweep.ts';
import { createWorkspace } from '../workspace.ts';

const AT = Date.UTC(2026, 7, 18, 12, 0, 0);

/**
 * The sweep is a **mechanism and not the owner**, which is what these tests are about.
 *
 * The mint owns a hosted workspace's schema: a workspace takes its migration the next time
 * somebody opens it, and one nobody opens costs nothing. This is the case that cannot serve — a
 * migration with a deadline — and it reaches workspaces ahead of their users. Nothing runs it
 * automatically, which is the difference between the two.
 */
const twoWorkspaces = async (
	db: Awaited<ReturnType<typeof freshDatabase>>['db'],
	turso: ReturnType<typeof tursoInMemory>
) => {
	// **Two owners, because an account owns exactly one workspace** (requirement 6, and the unique
	// index on `owner_account_id`). The sweep is about workspaces rather than about people, so what
	// it needs is two of them and it does not care whose.
	const first = await signInWithGoogle(db, SOMEBODY, AT);
	const second = await signInWithGoogle(
		db,
		{ ...SOMEBODY, subject: 'google-subject-2', email: 'noura@example.com' },
		AT
	);

	return [
		await createWorkspace(db, turso.platform, { accountId: first.id, name: 'Riyadh', now: AT }),
		await createWorkspace(db, turso.platform, { accountId: second.id, name: 'Jeddah', now: AT })
	];
};

test('a sweep takes every workspace to the version this build ships', async () => {
	const { db, close } = await freshDatabase();
	const turso = tursoInMemory();
	const hosted = await workspaceDatabases();

	try {
		const target = await targetSchemaVersion();
		const made = await twoWorkspaces(db, turso);

		const {
			swept,
			failed,
			target: reported
		} = await sweepWorkspaceSchemas(db, turso.platform, hosted.connect, { now: AT });

		assert.equal(reported, target);
		assert.deepEqual(failed, []);
		assert.deepEqual(
			swept.map((one) => [one.from, one.to]),
			[
				[0, target],
				[0, target]
			]
		);

		for (const one of made) {
			const [record] = await db.select().from(workspace).where(eq(workspace.id, one.id));

			assert.equal(record?.schemaVersion, target);

			const { rows } = await hosted
				.open(`libsql://${one.databaseHostname}`)
				.execute("select name from sqlite_master where type = 'table' and name = 'contract'");

			assert.equal(rows.length, 1, `${one.name} was not migrated`);
		}

		// Running it twice is the ordinary case — a deadline is met once and the command is run
		// again by somebody who is not sure. Nothing is applied, and nothing objects.
		const again = await sweepWorkspaceSchemas(db, turso.platform, hosted.connect, { now: AT });

		assert.deepEqual(
			again.swept.map((one) => [one.from, one.to]),
			[
				[target, target],
				[target, target]
			]
		);
	} finally {
		await hosted.close();
		await close();
	}
});

/**
 * One workspace's failure does not end the run, and that is decision 06's own objection to a
 * deploy-time sweep answered: a sweep that stops at the first refusal leaves the estate at two
 * versions with nothing saying which is which. This finishes, and names what it could not do.
 */
test('a workspace that will not migrate is reported, and the rest are still swept', async () => {
	const { db, close } = await freshDatabase();
	const turso = tursoInMemory();
	const hosted = await workspaceDatabases();

	try {
		const target = await targetSchemaVersion();
		const [first, second] = await twoWorkspaces(db, turso);

		assert.ok(first && second);

		const refusingTheFirst: ConnectToWorkspaceDatabase = (where) => {
			if (where.url.includes(first.databaseName)) {
				throw new Error('turso would not open that database');
			}

			return hosted.connect(where);
		};

		const { swept, failed } = await sweepWorkspaceSchemas(db, turso.platform, refusingTheFirst, {
			now: AT
		});

		assert.deepEqual(
			failed.map((one) => one.workspaceId),
			[first.id]
		);
		assert.deepEqual(
			swept.map((one) => [one.workspaceId, one.to]),
			[[second.id, target]]
		);

		const [behind] = await db.select().from(workspace).where(eq(workspace.id, first.id));

		assert.equal(behind?.schemaVersion, 0, 'a workspace that failed claims to have migrated');
	} finally {
		await hosted.close();
		await close();
	}
});
