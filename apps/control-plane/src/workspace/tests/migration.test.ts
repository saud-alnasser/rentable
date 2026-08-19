import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import test from 'node:test';
import { basename, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Client } from '@libsql/client';
import { workspaceMigrationsFolder } from '@rentable/workspace-migrations';

import { Refusal, WORKSPACE_UNAVAILABLE } from '../../failure.ts';
import {
	migrateWorkspaceDatabase,
	targetSchemaVersion,
	versionOfWorkspaceDatabase,
	workspaceMigrations
} from '../migration.ts';
import { workspaceDatabases } from '../../tests/testing.ts';

/**
 * There is one copy of the workspace migrations and it is a package both consumers depend on.
 *
 * *There were two until this ticket's review: a copy under `apps/control-plane/` held identical to
 * the desktop's by a test in this file. The copy was removed rather than better-guarded, because
 * the guard was hashed only against this package's own files — so the commit that broke it would
 * not have run it.*
 */
const FOLDER = workspaceMigrationsFolder;

const sqlFilesIn = async (folder: URL) =>
	(await readdir(fileURLToPath(folder))).filter((name) => name.endsWith('.sql')).sort();

// Nobody bumps this number: it is the count of migrations shipped, so generating one moves it.
test('the version this build targets is the set the package ships', async () => {
	assert.equal(await targetSchemaVersion(), (await sqlFilesIn(FOLDER)).length);
	assert.deepEqual(
		(await workspaceMigrations()).map((migration) => migration.name),
		await sqlFilesIn(FOLDER)
	);
});

/**
 * The migrations this API applies are not its own: they are the package the desktop is built from.
 *
 * *This replaced a byte-for-byte comparison against a copy under `apps/control-plane/`. The copy
 * is gone — `apps/desktop/src/lib/platform/database/tests/migrations.test.ts` is the other half,
 * and it lives over there because that is where a commit that moved the generator would land.*
 */
test('the migrations this API applies come from the workspace migrations package', async () => {
	const shipped = await sqlFilesIn(FOLDER);

	assert.ok(shipped.length > 0, 'no workspace migrations are shipped at all');
	assert.equal(basename(dirname(fileURLToPath(FOLDER))), 'workspace-migrations');
	assert.ok(
		!fileURLToPath(FOLDER).includes(`${sep}apps${sep}`),
		'the migrations are inside an application again'
	);
});

const tablesIn = async (client: Client) => {
	const { rows } = await client.execute(
		"select name from sqlite_master where type = 'table' order by name"
	);

	return rows.map((row) => String(row.name));
};

const WORKSPACE = 'a-workspace-org.aws-eu-west-1.turso.io';

/**
 * Acceptance criterion 12's hosted half, at the level where the SQL actually runs: the migrations
 * this package ships, applied by the code that ships, to a real database through the same libSQL
 * client a deployed control plane opens against Turso.
 */
test('an empty workspace database comes out holding the domain schema', async () => {
	const hosted = await workspaceDatabases();

	try {
		const target = await targetSchemaVersion();
		const client = hosted.connect({ url: WORKSPACE, authToken: 'a-token' });

		assert.equal(await migrateWorkspaceDatabase(client, target, { database: WORKSPACE }), target);

		const tables = await tablesIn(hosted.open(WORKSPACE));

		for (const named of ['complex', 'contract', 'payment', 'tenant', 'unit', 'history']) {
			assert.ok(tables.includes(named), `the workspace database has no ${named} table`);
		}

		assert.ok(tables.includes('__migrations__'), 'nothing recorded what was applied');
	} finally {
		await hosted.close();
	}
});

/**
 * The ledger is the Rust runner's, and that identity is load-bearing rather than tidy.
 *
 * A replica of a hosted database reaches machines whose runner decides what to apply by reading
 * exactly this table. Finding every shipped migration recorded, it applies none; finding no table
 * at all it would start at `0000` and fail on a table that already exists — a working replica
 * broken by the thing meant to prepare it.
 */
test('a migrated workspace database carries the ledger a local one carries', async () => {
	const hosted = await workspaceDatabases();

	try {
		await migrateWorkspaceDatabase(
			hosted.connect({ url: WORKSPACE, authToken: 'a-token' }),
			await targetSchemaVersion(),
			{ database: WORKSPACE }
		);

		const { rows } = await hosted
			.open(WORKSPACE)
			.execute('select name from __migrations__ order by name');

		assert.deepEqual(
			rows.map((row) => String(row.name)),
			(await workspaceMigrations()).map((migration) => migration.name)
		);
	} finally {
		await hosted.close();
	}
});

const typeOfTenantId = async (client: Client) => {
	const { rows } = await client.execute('select name, type from pragma_table_info(?)', ['tenant']);

	return String(rows.find((row) => String(row.name) === 'id')?.type).toLowerCase();
};

/**
 * The mint passes the version its client was built against, and a client is routinely behind what
 * this build ships. **Taking the workspace past it would be the divergence the refusal exists to
 * stop**, arriving from the other side — so the ceiling is a ceiling, and the rest waits for a
 * client that understands it.
 */
test('a ceiling is a ceiling: nothing past it is applied, and the rest waits', async () => {
	const hosted = await workspaceDatabases();

	try {
		const target = await targetSchemaVersion();
		const client = hosted.connect({ url: WORKSPACE, authToken: 'a-token' });

		// Two of the four: the tables, and the two columns 0001 adds. Not `history`, which is
		// 0002's, and not the identity change, which is 0003's.
		assert.equal(await migrateWorkspaceDatabase(client, 2, { database: WORKSPACE }), 2);

		const partly = await tablesIn(hosted.open(WORKSPACE));

		assert.ok(partly.includes('tenant'), '0000 was not applied');
		assert.ok(!partly.includes('history'), '0002 was applied past the ceiling');
		assert.equal(await typeOfTenantId(hosted.open(WORKSPACE)), 'integer');

		// And the rest applies later, to the same database, without redoing what was done.
		assert.equal(await migrateWorkspaceDatabase(client, target, { database: WORKSPACE }), target);

		const fully = await tablesIn(hosted.open(WORKSPACE));

		assert.ok(fully.includes('history'), '0002 never arrived');
		assert.equal(
			await typeOfTenantId(hosted.open(WORKSPACE)),
			'text',
			'the identity migration was not applied'
		);
	} finally {
		await hosted.close();
	}
});

// Applying nothing is the ordinary case once a workspace is up to date, and it has to be cheap
// and silent rather than an error about a table that already exists.
test('migrating a database that is already there applies nothing', async () => {
	const hosted = await workspaceDatabases();

	try {
		const target = await targetSchemaVersion();
		const client = hosted.connect({ url: WORKSPACE, authToken: 'a-token' });

		assert.equal(await migrateWorkspaceDatabase(client, target, { database: WORKSPACE }), target);
		assert.equal(await migrateWorkspaceDatabase(client, target, { database: WORKSPACE }), target);
	} finally {
		await hosted.close();
	}
});

/**
 * Two mints on one unmigrated workspace, which is two devices arriving at once — the case this
 * effort exists for.
 *
 * Both read an empty ledger, both would run `CREATE TABLE complex`, and the loser used to see
 * `table complex already exists`: not a `Refusal`, so a `500` saying nothing about retrying. They
 * are serialised per workspace database now, so the second gets the first's result.
 */
test('two mints migrating one workspace at once do not collide', async () => {
	const hosted = await workspaceDatabases();

	try {
		const target = await targetSchemaVersion();

		const [first, second] = await Promise.all([
			migrateWorkspaceDatabase(hosted.connect({ url: WORKSPACE, authToken: 'a' }), target, {
				database: WORKSPACE
			}),
			migrateWorkspaceDatabase(hosted.connect({ url: WORKSPACE, authToken: 'b' }), target, {
				database: WORKSPACE
			})
		]);

		assert.equal(first, target);
		assert.equal(second, target);
	} finally {
		await hosted.close();
	}
});

/**
 * A workspace database that will not answer is `workspace_unavailable`, not a `500`.
 *
 * `turso.ts` types every Platform API failure and nothing typed the libSQL side, so Turso's
 * database endpoint being down while its Platform API is up reached the server's generic catch.
 * The caller's move is to retry, and it can only know that if it is told.
 */
test('a workspace database that will not answer is a typed refusal', async () => {
	const refusing = {
		execute: () => Promise.reject(new Error('libsql: connection refused')),
		migrate: () => Promise.reject(new Error('libsql: connection refused')),
		close: () => {}
	} as unknown as Client;

	const failure = await migrateWorkspaceDatabase(refusing, 1, {
		database: 'ws-unreachable'
	}).then(
		() => null,
		(caught: unknown) => caught
	);

	assert.ok(failure instanceof Refusal, `expected a refusal, got ${failure}`);
	assert.equal(failure.code, WORKSPACE_UNAVAILABLE);
	assert.equal(failure.status, 503);
	assert.match(failure.message, /try again/);
});

// The ledger is the authority the workspace record indexes, so it has to be readable on its own.
test('a database says what version it is at, from its own ledger', async () => {
	const hosted = await workspaceDatabases();

	try {
		const client = hosted.connect({ url: WORKSPACE, authToken: 'a-token' });

		assert.equal(await versionOfWorkspaceDatabase(client), 0);

		await migrateWorkspaceDatabase(client, 2, { database: WORKSPACE });

		assert.equal(await versionOfWorkspaceDatabase(hosted.open(WORKSPACE)), 2);
	} finally {
		await hosted.close();
	}
});
