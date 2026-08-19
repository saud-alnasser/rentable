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
 * What ran is recorded in the database it ran against, and every file is in it.
 *
 * **The mint decides from this table**, through `versionOfWorkspaceDatabase`, whenever the
 * workspace record and the database itself might disagree — which is exactly after a migration
 * that failed partway. A ledger short of what was applied reads as a workspace further back than
 * it is, and a number that is too low is what lets an older client through.
 */
test('a migrated workspace database records every migration it applied', async () => {
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

/**
 * What the desktop's Rust harness covered, arriving here because the runner it ran through has
 * gone.
 *
 * **These are properties of the migration, not of whichever runner applies it** — that every row
 * and every reference crosses the identity change intact, that what it mints is a UUIDv7, and that
 * the order rows had survives it. They were pinned in `database/migrations.rs` because that was
 * the only runner there was; the client applies no migrations now, so this one is.
 *
 * *The rest of that harness went with the runner and is not reproduced: the parser round-trip and
 * the `PRAGMA` refusal were properties of `apply_migration`'s `sqlparser` pass, which exists on
 * neither side now.*
 */
const IDENTITY_MIGRATION = '0003_serious_synch.sql';

/**
 * The version a workspace is at with every migration before the identity change applied.
 *
 * **It fails rather than answering `-1`.** A renamed or collapsed file would otherwise make this a
 * ceiling one short of the target, and the three tests below would go on passing against a
 * workspace the identity change never met.
 */
const beforeTheIdentityChange = async () => {
	const at = (await workspaceMigrations()).findIndex(
		(migration) => migration.name === IDENTITY_MIGRATION
	);

	assert.ok(at >= 0, `${IDENTITY_MIGRATION} is not among the migrations this package ships`);

	return at;
};

/**
 * A workspace as the release before the identity change left it.
 *
 * Every reference is exercised, including the two the schema has no constraint for: a `history`
 * row about a record that no longer exists, and — deliberately — a contract naming a tenant that
 * is not there. Neither is reachable through the application, and both are what a file edited by
 * hand or an interrupted delete would leave behind.
 */
const OLD_SCHEMA_ROWS = [
	`INSERT INTO tenant (id, national_id, name, phone) VALUES
	 (1,'1000000001','Aisha','+966500000001'),(2,'1000000002','Bandar','+966500000002')`,
	`INSERT INTO complex (id, name, location) VALUES (1,'Al Nakheel','Riyadh'),(2,'Al Waha','Jeddah')`,
	`INSERT INTO unit (id, name, status, complex_id) VALUES
	 (1,'A1','occupied',1),(2,'A2','vacant',1),(3,'B1','vacant',2)`,
	`INSERT INTO contract (id, gov_id, status, start_date, end_date, interval_in_months,
	 cost_per_interval, paid_amount, expected_amount, tenant_id) VALUES
	 (1,'GOV-1','active',1700000000000,1731000000000,'12m',1000.0,1000.0,1000.0,1),
	 (2,NULL,'expired',1600000000000,1631000000000,'6m',500.0,0.0,500.0,2),
	 (3,'GOV-3','active',1700000000000,1731000000000,'1m',100.0,0.0,100.0,99)`,
	`INSERT INTO contract_unit (contract_id, unit_id) VALUES (1,1),(2,2),(3,3)`,
	`INSERT INTO payment (id, date, amount, contract_id) VALUES
	 (1,1700000000000,600.0,1),(2,1700100000000,400.0,1)`,
	`INSERT INTO history (id, at, concept, record_id, action, record) VALUES
	 (1,1700000000000,'tenant',1,'created','Aisha'),
	 (2,1700000000001,'contract',1,'created','GOV-1'),
	 (3,1700000000002,'tenant',77,'created','Ghost'),
	 (4,1700000000003,'tenant',77,'deleted','Ghost')`
];

/** A workspace populated under the old schema and then migrated for real. */
const migratedFromTheOldSchema = async (
	hosted: Awaited<ReturnType<typeof workspaceDatabases>>,
	rows: string[]
) => {
	const client = hosted.connect({ url: WORKSPACE, authToken: 'a-token' });

	await migrateWorkspaceDatabase(client, await beforeTheIdentityChange(), { database: WORKSPACE });

	for (const statement of rows) {
		await client.execute(statement);
	}

	await migrateWorkspaceDatabase(client, await targetSchemaVersion(), { database: WORKSPACE });

	return client;
};

const countOf = async (client: Client, sql: string) => {
	const { rows } = await client.execute(sql);

	return Number(Object.values(rows[0])[0]);
};

const identitiesFrom = async (client: Client, sql: string) => {
	const { rows } = await client.execute(sql);

	return rows.map((row) => String(Object.values(row)[0]));
};

/**
 * A populated workspace crosses the identity migration with every row and every reference intact.
 *
 * What can fail here fails silently: a reference remapped to nothing, or a row quietly dropped by
 * one of the joins the migration rebuilds each table through. **There is not one foreign key in
 * this schema**, so nothing but this would object.
 */
test('a populated workspace crosses the identity migration whole', async () => {
	const hosted = await workspaceDatabases();

	try {
		const client = await migratedFromTheOldSchema(hosted, OLD_SCHEMA_ROWS);

		// counted per concept rather than spot-checked: a join that dropped rows is exactly the
		// failure this migration is capable of, and it leaves a smaller table behind.
		for (const [table, expected] of [
			['tenant', 2],
			['complex', 2],
			['unit', 3],
			['contract', 3],
			['contract_unit', 3],
			['payment', 2],
			['history', 4]
		] as const) {
			assert.equal(
				await countOf(client, `SELECT count(*) FROM ${table}`),
				expected,
				`${table} should carry every row it had before the migration`
			);
		}

		assert.ok(
			!(await tablesIn(hosted.open(WORKSPACE))).includes('idmap'),
			'the identity map should not survive the migration that built it'
		);

		// every reference resolves. An inner join returning fewer rows than the table holds is a
		// reference that now points at nothing.
		for (const [sql, expected, what] of [
			[
				'SELECT count(*) FROM contract c JOIN tenant t ON t.id = c.tenant_id',
				2,
				'every contract naming a tenant that exists should still name it'
			],
			[
				'SELECT count(*) FROM unit u JOIN complex c ON c.id = u.complex_id',
				3,
				'every unit should still name its complex'
			],
			[
				`SELECT count(*) FROM contract_unit a JOIN contract c ON c.id = a.contract_id
				 JOIN unit u ON u.id = a.unit_id`,
				3,
				'every assignment should still name its contract and its unit'
			],
			[
				'SELECT count(*) FROM payment p JOIN contract c ON c.id = p.contract_id',
				2,
				'every payment should still name its contract'
			],
			[
				`SELECT count(*) FROM history h JOIN tenant t ON t.id = h.record_id
				 WHERE h.concept = 'tenant'`,
				1,
				'a history entry about a live tenant should still name it'
			]
		] as const) {
			assert.equal(await countOf(client, sql), expected, what);
		}

		// the deleted tenant has no row to map from, so its identity is minted from `history`
		// itself — once for the record, not once per entry, or two entries about one deletion would
		// stop being about the same thing.
		const orphaned = await identitiesFrom(
			client,
			`SELECT record_id FROM history WHERE record = 'Ghost' ORDER BY at`
		);

		assert.equal(orphaned.length, 2, 'both entries about the deleted tenant should survive');
		assert.equal(
			orphaned[0],
			orphaned[1],
			`two entries about one deleted record should point at one identity, got ${orphaned.join(', ')}`
		);
		assert.equal(
			await countOf(client, `SELECT count(*) FROM tenant WHERE id = '${orphaned[0]}'`),
			0,
			"the deleted tenant's minted identity should not collide with a live row"
		);
	} finally {
		await hosted.close();
	}
});

/**
 * Every migrated identity is a well-formed UUIDv7, and no two rows share one.
 *
 * The grammar is checked rather than assumed because the values are built by `printf` in SQL: a
 * format string that lost a digit would still produce a string, and a string is all a `TEXT` column
 * asks for. Distinctness spans the concepts as well as each one — they share an identity space the
 * moment two workspaces meet, which is the whole reason for the change.
 */
test('every migrated identity is a distinct well-formed uuid7', async () => {
	const hosted = await workspaceDatabases();

	try {
		const client = await migratedFromTheOldSchema(hosted, OLD_SCHEMA_ROWS);
		const all: string[] = [];

		for (const table of ['tenant', 'complex', 'unit', 'contract', 'payment', 'history']) {
			const identities = await identitiesFrom(client, `SELECT id FROM ${table}`);

			for (const id of identities) {
				assert.match(
					id,
					/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
					`${table} ${id} is not a lowercase UUIDv7 carrying the RFC 9562 variant`
				);
			}

			all.push(...identities);
		}

		assert.equal(
			new Set(all).size,
			all.length,
			'no two migrated records should share an identity, across concepts as well as within one'
		);
	} finally {
		await hosted.close();
	}
});

/**
 * Migrated rows come back in the order their row ids had.
 *
 * Every row that exists at migration time shares one 48-bit timestamp, so the order is decided by
 * everything after it — and the palette's contract search orders by the identity alone, with no
 * second column to fall back on. Seeding the value from the old id is what makes this hold, and a
 * form that randomised any field above the seed would fail here rather than in front of a reader.
 */
test('migrated rows keep the order their row ids had', async () => {
	const hosted = await workspaceDatabases();

	try {
		// enough rows that an order preserved by luck would have to be very lucky
		const complexes = Array.from({ length: 20 }, (_, chunk) => {
			const values = Array.from({ length: 50 }, (_, row) => {
				const id = chunk * 50 + row + 10;

				return `(${id},'C${id}','L${id}')`;
			});

			return `INSERT INTO complex (id, name, location) VALUES ${values.join(',')}`;
		});

		const client = await migratedFromTheOldSchema(hosted, complexes);

		// the name carries the old id, so the two orders can be compared without keeping a mapping
		// the migration deliberately destroys
		const byIdentity = await identitiesFrom(client, 'SELECT name FROM complex ORDER BY id');
		const byOldId = await identitiesFrom(
			client,
			'SELECT name FROM complex ORDER BY CAST(substr(name, 2) AS INTEGER)'
		);

		assert.equal(byIdentity.length, 1000, 'every row should have been migrated');
		assert.deepEqual(
			byIdentity,
			byOldId,
			'ordering by the new identity should give the order the rowids had'
		);
	} finally {
		await hosted.close();
	}
});
