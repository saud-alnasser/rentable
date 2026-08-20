import 'dotenv/config';

import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { createClient, type Client } from '@libsql/client';
import { workspaceMigrationsFolder } from '@rentable/workspace-migrations';
import { eq } from 'drizzle-orm';

import { workspace as workspaceRecord } from '../../database/schema.ts';
import {
	answerOf,
	freshDatabase,
	googleVouchingFor,
	post,
	runningControlPlane,
	SOMEBODY
} from '../../tests/testing.ts';
import { targetSchemaVersion } from '../migration.ts';
import { tursoPlatform, type WorkspaceDatabase } from '../turso.ts';

/**
 * What sign-up produced, read from the database it produced rather than from the code that would
 * have produced it — acceptance criterion 6, and #572.
 *
 * **This reaches a live Turso account, which nothing else in this package does.**
 * `server/tests/server.test.ts` runs the real routes and `workspace/tests/migration.test.ts` the
 * real migration code, both against `file:` libSQL with the Platform API faked, which is what makes
 * them worth running and cheap to run. It is also what left #557's criterion 5 recorded as
 * *documented, not exercised end to end*: a `file:` database says nothing about whether Turso's own
 * SQL dialect accepts this schema, and that was the open question.
 *
 * **It is opted into and never runs in continuous integration.** The testing rule states that under
 * *Tests that reach a live remote*, along with what bounds it. The opt-in is `RENTABLE_LIVE_TURSO=1`
 * beside the three credentials, and asking for a live run without the credentials **fails** rather
 * than skipping, because a run that meant to be live and silently was not is the one outcome worth
 * refusing.
 *
 * ```
 * RENTABLE_LIVE_TURSO=1 TURSO_API_TOKEN=… TURSO_ORG=… TURSO_GROUP=… \
 *   pnpm --filter @rentable/control-plane test
 * ```
 *
 * `apps/control-plane/.env` is read on the way in, so those can live there instead. It is
 * gitignored; `apps/desktop/.env` carries the token and the org and **not** the group.
 */
const asked = process.env.RENTABLE_LIVE_TURSO?.trim() === '1';

const skipped = {
	skip: asked ? false : 'a live Turso account is opted into with RENTABLE_LIVE_TURSO=1'
};

const credential = (name: string): string => {
	const value = process.env[name]?.trim();

	assert.ok(
		value,
		`${name} is not set. a live run was asked for with RENTABLE_LIVE_TURSO=1, and it cannot be served`
	);

	return value;
};

type DeclaredSchema = {
	/** every table the schema declares, by name. */
	tables: string[];
	/** the primary key columns of each table, by table name. */
	primaryKeys: Map<string, string[]>;
	/** the referencing columns of each table, by table name, from declared foreign keys. */
	foreignKeys: Map<string, string[]>;
};

/**
 * The schema this build ships, as drizzle recorded it — the authority for what the schema
 * *declares*, which is the word criterion 6 uses.
 *
 * **Read from the snapshot rather than listed here, and the keys are read as keys.** A list of
 * table names in this file is a second copy of the schema and goes stale in silence; a *heuristic*
 * over column names is worse, because it reads as a check on keys while actually checking a naming
 * convention — `tenant.national_id` and `contract.gov_id` end in `_id` and are not keys, and
 * `contract_unit` has no primary key at all. `primaryKey` on a column and `foreignKeys` on a table
 * are what drizzle records, so they are what this asks for.
 */
const declaredSchema = async (): Promise<DeclaredSchema> => {
	const meta = new URL('meta/', workspaceMigrationsFolder);
	const snapshots = (await readdir(fileURLToPath(meta)))
		.filter((name) => name.endsWith('_snapshot.json'))
		.sort();

	const latest = snapshots.at(-1);

	assert.ok(
		latest,
		'the migrations package ships no snapshot, so nothing states what the schema is'
	);

	const parsed = JSON.parse(await readFile(new URL(latest, meta), 'utf8')) as {
		tables: Record<
			string,
			{
				name: string;
				columns: Record<string, { name: string; type: string; primaryKey?: boolean }>;
				foreignKeys?: Record<string, { columnsFrom?: string[] }>;
			}
		>;
	};

	const tables: string[] = [];
	const primaryKeys = new Map<string, string[]>();
	const foreignKeys = new Map<string, string[]>();

	for (const table of Object.values(parsed.tables)) {
		tables.push(table.name);

		primaryKeys.set(
			table.name,
			Object.values(table.columns)
				.filter((column) => column.primaryKey === true)
				.map((column) => column.name)
		);

		foreignKeys.set(
			table.name,
			Object.values(table.foreignKeys ?? {}).flatMap((key) => key.columnsFrom ?? [])
		);
	}

	// **A floor, because an empty list is what a shape change looks like from here.** If drizzle
	// ever emits `tables` as an array or renames the key, every loop below iterates zero times and
	// the schema half of this test passes having asserted nothing — the failure this function exists
	// to prevent, arriving through the door it left open.
	assert.ok(
		tables.length >= 7,
		`the snapshot yielded ${tables.length} tables, and the schema has had at least seven since 0002`
	);

	return { tables, primaryKeys, foreignKeys };
};

/**
 * Everything a live run needs, torn down afterwards.
 *
 * `opened` counts the connections the control plane made to a workspace database, which is how the
 * refusal below establishes that a refused mint opened nothing. `created` carries what
 * `createDatabase` answered with rather than only its name, so a test reaches the hostname Turso
 * gave rather than one rebuilt from a region this account may not be in.
 *
 * **The workspace database is removed on the way out, and a refusal is reported rather than
 * swallowed.** Turso will not delete a database inside a delete-protected group; against such a
 * group this leaves a database behind and says which one.
 */
const withLiveControlPlane = async (
	run: (reached: {
		url: string;
		db: Awaited<ReturnType<typeof freshDatabase>>['db'];
		open: (database: WorkspaceDatabase) => Promise<Client>;
		created: WorkspaceDatabase[];
		opened: string[];
	}) => Promise<void>
) => {
	const apiToken = credential('TURSO_API_TOKEN');
	const organization = credential('TURSO_ORG');
	const group = credential('TURSO_GROUP');

	const platform = tursoPlatform({ apiToken, organization, group });
	const { db, close: closeDatabase } = await freshDatabase();

	const created: WorkspaceDatabase[] = [];
	const opened: string[] = [];
	const clients: Client[] = [];

	// The same libSQL client `main.ts` wires in, against a real hostname and a token minted for the
	// occasion. This is the only difference from every other test in this package.
	const connectToWorkspace = ({ url, authToken }: { url: string; authToken: string }) => {
		opened.push(url);

		const client = createClient({ url, authToken });
		clients.push(client);

		return client;
	};

	const { url, close } = await runningControlPlane({
		db,
		verifyIdentity: googleVouchingFor(SOMEBODY),
		platform: {
			...platform,
			createDatabase: async (name) => {
				const database = await platform.createDatabase(name);
				created.push(database);

				return database;
			}
		},
		connectToWorkspace
	});

	/** open one of the created databases with a token of this test's own, to read it back. */
	const open = async (database: WorkspaceDatabase): Promise<Client> => {
		const client = createClient({
			url: `libsql://${database.hostname}`,
			authToken: await platform.mintToken(database.name, '30m')
		});
		clients.push(client);

		return client;
	};

	try {
		await run({ url, db, open, created, opened });
	} finally {
		for (const client of clients) {
			client.close();
		}

		await close();
		await closeDatabase();

		for (const database of created) {
			await platform.deleteDatabase(database.name).catch((refusal: unknown) => {
				console.error(
					`the workspace database ${database.name} was created and is now unreferenced`,
					refusal
				);
			});
		}
	}
};

const onlyWorkspace = (created: WorkspaceDatabase[]): WorkspaceDatabase => {
	const [first] = created;

	assert.ok(first, 'no workspace database was created');

	return first;
};

// Acceptance criterion 6: one workspace for the account, every declared table, TEXT keys as the
// schema declares them, no idmap, and the recorded version equal to the one the mint was asked for.
test('signing up creates one workspace with the schema the client expects', skipped, async () => {
	await withLiveControlPlane(async ({ url, db, open, created }) => {
		const { session, account } = await answerOf(await post(url, '/account/sign-in'));

		assert.ok(session && account, 'signing in reached no account');

		const madeWorkspace = await post(url, '/workspace', {
			token: session.token,
			body: { name: 'a portfolio' }
		});

		assert.equal(madeWorkspace.status, 201);

		const { workspace } = await answerOf(madeWorkspace);

		assert.ok(workspace, 'creating a workspace answered without one');

		// The client's own number. `build.rs` writes `WORKSPACE_SCHEMA_VERSION` as the count of the
		// shipped `.sql` files and `database/version.rs`'s own test pins the constant to that count,
		// so the number the desktop sends is derived the same way from the same package. **Three
		// files agree and this one observes one of them**: what is checked here is that the mint
		// reached the version it was asked for. That the Rust constant equals it is the Rust suite's
		// to hold, and it is stated here rather than re-derived.
		const clientVersion = await targetSchemaVersion();

		const minted = await post(url, `/workspace/${workspace.id}/token`, {
			token: session.token,
			body: { schemaVersion: clientVersion }
		});

		assert.equal(minted.status, 200, 'the mint refused a client at the shipped schema version');

		// --- the account owns one workspace ------------------------------------------------------
		//
		// Asked of the account rather than counted off this test's own calls: a counter over
		// `createDatabase` establishes that one call created one database, which is arithmetic
		// rather than a property of the system.
		const owned = await db
			.select()
			.from(workspaceRecord)
			.where(eq(workspaceRecord.ownerAccountId, account.id));

		assert.equal(owned.length, 1, `the account owns ${owned.length} workspaces after one sign-up`);
		assert.equal(created.length, 1, `${created.length} databases were created for one workspace`);

		const ledger = await open(onlyWorkspace(created));

		// --- every table the schema declares is present, and no idmap survives -------------------
		const declared = await declaredSchema();
		const present = new Set(
			(
				await ledger.execute(
					"SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != '__migrations__'"
				)
			).rows.map((row) => String(row.name))
		);

		assert.deepEqual(
			[...present].sort(),
			[...declared.tables].sort(),
			'the created database and the schema disagree about which tables exist'
		);

		assert.ok(
			!present.has('idmap'),
			'idmap survived the identity migration, so the remap table is still in the workspace'
		);

		// --- every primary and foreign key is TEXT, read from the database -----------------------
		//
		// Read back rather than inferred from the migration: on a fresh database 0003 finds empty
		// tables and rewrites the schema, and *that it ran* is a different fact from *the schema is
		// right*. This asserts the second.
		let keysChecked = 0;

		for (const table of declared.tables) {
			const info = await ledger.execute(`PRAGMA table_info(${table})`);

			assert.ok(info.rows.length > 0, `${table} has no columns`);

			const actual = new Map(
				info.rows.map((row) => [String(row.name), String(row.type).toUpperCase()])
			);

			const keys = [
				...(declared.primaryKeys.get(table) ?? []),
				...(declared.foreignKeys.get(table) ?? [])
			];

			for (const key of keys) {
				assert.equal(
					actual.get(key),
					'TEXT',
					`${table}.${key} is a declared key and the database has it as ${actual.get(key)}, not TEXT`
				);

				keysChecked += 1;
			}
		}

		assert.ok(keysChecked >= 6, `only ${keysChecked} declared keys were checked, which is too few`);

		// **The schema declares no foreign key constraints at all**, so the loop above covers primary
		// keys and nothing else. That is worth knowing rather than papering over: every referencing
		// column is TEXT today because 0003 rewrote it, and nothing in the schema holds it that way.
		assert.deepEqual(
			[...declared.foreignKeys.values()].flat(),
			[],
			'the schema has grown a declared foreign key and the loop above now covers it, so this assertion and its comment can go'
		);

		// --- the recorded version equals the one the mint was asked for --------------------------
		const [recorded] = await db
			.select()
			.from(workspaceRecord)
			.where(eq(workspaceRecord.id, workspace.id))
			.limit(1);

		assert.ok(recorded, 'the workspace this test created has no record');

		assert.equal(
			recorded.schemaVersion,
			clientVersion,
			'the version recorded against the workspace is not the one the client asked to open it at'
		);

		// And the workspace's own ledger holds the run of files that version means. A count alone
		// would be the wrong question — `versionOf` is deliberately a prefix, because a gap is not a
		// version — so this reads the names and checks the run is unbroken.
		const applied = (
			await ledger.execute('SELECT name FROM __migrations__ ORDER BY name')
		).rows.map((row) => String(row.name));

		assert.equal(
			applied.length,
			clientVersion,
			"the workspace's ledger holds a different run of migrations than the column records"
		);
	});
});

// #572's last criterion, and acceptance criterion 12's client half: an older client is refused, and
// nothing is written for it.
test(
	'a client older than the workspace schema is refused and issues no write',
	skipped,
	async () => {
		await withLiveControlPlane(async ({ url, open, created, opened }) => {
			const { session } = await answerOf(await post(url, '/account/sign-in'));

			assert.ok(session);

			const { workspace } = await answerOf(
				await post(url, '/workspace', { token: session.token, body: { name: 'a portfolio' } })
			);

			assert.ok(workspace);

			const clientVersion = await targetSchemaVersion();

			assert.ok(clientVersion > 1, 'there is no older version for a client to be at');

			// Bring the workspace to the shipped schema first, so the older client below is behind
			// something rather than ahead of nothing.
			assert.equal(
				(
					await post(url, `/workspace/${workspace.id}/token`, {
						token: session.token,
						body: { schemaVersion: clientVersion }
					})
				).status,
				200
			);

			const ledger = await open(onlyWorkspace(created));
			const before = (
				await ledger.execute('SELECT name FROM __migrations__ ORDER BY name')
			).rows.map((row) => String(row.name));
			const openedBefore = opened.length;

			const refused = await post(url, `/workspace/${workspace.id}/token`, {
				token: session.token,
				body: { schemaVersion: clientVersion - 1 }
			});

			assert.equal(refused.status, 409, 'an older client was not refused');

			const { error, token } = await answerOf(refused);

			assert.equal(error?.code, 'client_out_of_date', 'the refusal is not the typed one');
			assert.match(
				error?.message ?? '',
				/update the application/,
				'the refusal does not name the action to take'
			);
			assert.equal(token, undefined, 'an older client was handed a token with the refusal');

			// **Issues no write, established where a write could have happened.** A ledger diff alone
			// cannot fail here: the refusal is raised before any connection is opened, and even without
			// it the runner would apply a prefix it has already applied. What separates the two is that
			// the refusing path opens the workspace database *not at all*.
			assert.equal(
				opened.length,
				openedBefore,
				'the refused mint opened the workspace database, so it reached the thing it refused to touch'
			);

			const after = (
				await ledger.execute('SELECT name FROM __migrations__ ORDER BY name')
			).rows.map((row) => String(row.name));

			assert.deepEqual(after, before, 'the refused mint changed what the workspace had applied');
		});
	}
);
