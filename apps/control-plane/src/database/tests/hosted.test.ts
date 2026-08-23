import 'dotenv/config';

import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { eq, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/libsql/migrator';

import { connect, database, describe as describeDatabase, resolveDatabase } from '../database.ts';
import { account, membership, session, workspace } from '../schema.ts';
import {
	answerOf,
	googleVouchingFor,
	post,
	runningControlPlane,
	tursoInMemory,
	workspaceDatabases
} from '../../tests/testing.ts';
import { targetSchemaVersion } from '../../workspace/migration.ts';

/**
 * The control plane's own records, over the wire rather than over a file, which is the thing the
 * effort *the control plane keeps its records on turso* exists to stop taking on faith.
 *
 * **This is the second test in this package that reaches a live Turso account, and the third in
 * the repository.** `workspace/tests/provisioning.test.ts` asks whether Turso's SQL dialect accepts
 * a *workspace* schema; the four `losing_writer` tests in `apps/desktop/tauri/` ask what the sync
 * engine does when two replicas diverge. This one asks a third question: whether the control
 * plane's own records work when they are hosted. Every other test in this package migrates a
 * `file:` database, so this schema has always been exercised and its wire never has.
 *
 * **It provisions nothing on Turso.** The platform is `tursoInMemory()`, so a sign-up here creates
 * no workspace database on anybody's account, and the workspace database the mint opens is a file
 * in a temporary directory, through `workspaceDatabases()`. What is under test is this process's
 * *own* records crossing a network. A workspace's records already have their own live test, and
 * running a second one would create databases the delete-protected group will not give back.
 *
 * **`RENTABLE_LIVE_TURSO` is not this file's own flag, and that matters before it is set.**
 * `workspace/tests/provisioning.test.ts` reads the same variable, and `src/tests/run.ts` expands
 * every test file in the package, so arming the whole suite arms that one too. It creates two
 * `ws-` databases per run, which the delete-protected group will not let anything remove. Run this
 * file on its own, which is what the invocation below does.
 *
 * **It runs against a database of its own**, named by `CONTROL_PLANE_LIVE_TEST_DATABASE_URL`, and
 * never against `CONTROL_PLANE_DATABASE_URL`. That was considered during plan and rejected: the
 * second is the database the control plane serves from, and a test that wrote into it would be
 * putting rows in among real accounts. The test database is created once and reused, because the
 * group on this account is delete-protected and a throwaway per run would strand one for good
 * against a free tier that stops at a hundred.
 *
 * **It is opted into and never runs in continuous integration**, on the terms `[[rules/testing]]`
 * fixes under *Tests that reach a live remote*. The opt-in is the existing `RENTABLE_LIVE_TURSO=1`
 * rather than a flag of its own, and asking for a live run without the credentials **fails**
 * rather than skipping, because a run that meant to be live and silently was not is the one
 * outcome worth refusing.
 *
 * ```
 * RENTABLE_LIVE_TURSO=1 node --import tsx --test src/database/tests/hosted.test.ts
 * ```
 *
 * The single-file invocation `[[references/node-test]]` documents, rather than the whole suite, for
 * the reason above. `apps/control-plane/.env` is read on the way in, so the two credentials can
 * live there. The opt-in belongs on the command, where it arms one file rather than two. `.env` is
 * gitignored, and `.env.example` documents all three.
 *
 * **The opt-in triple below is a second copy of `provisioning.test.ts`'s**, and it is deliberate.
 * `[[rules/testing]]` puts what two test files share in `src/tests/testing.ts`, and this effort's
 * spec constrains that module to be unchanged. The ticket resolves it the other way, by pointing at
 * `provisioning.test.ts` as the shape to copy. Spec outranks ticket, so the copy stays and the
 * conflict is recorded here rather than settled in passing.
 */
const asked = process.env.RENTABLE_LIVE_TURSO?.trim() === '1';

const skipped = {
	skip: asked ? false : 'a live Turso database is opted into with RENTABLE_LIVE_TURSO=1'
};

const credential = (name: string): string => {
	const value = process.env[name]?.trim();

	assert.ok(
		value,
		`${name} is not set. a live run was asked for with RENTABLE_LIVE_TURSO=1, and it cannot be served`
	);

	return value;
};

/**
 * The test database, opened through the same `connect` the four entrypoints open theirs with.
 *
 * **The live variables are handed to the real resolver under the names it reads**, which is what
 * keeps this off `CONTROL_PLANE_DATABASE_URL` while still deriving the configuration rather than
 * declaring it. `resolveDatabase` is pure and takes its environment as an argument, so passing an
 * object built here reads nothing from the machine.
 *
 * *An earlier version wrote `{ kind: 'hosted' }` by hand, and every guard over it was therefore a
 * tautology.* `describe` branches on `kind`, so a `file:` URL would have been announced as
 * `hosted file://`, `createClient` ignores an `authToken` on a file URL, and all four tests would
 * have passed against a file on disk without ever leaving the machine. The scheme is the only
 * thing that knows, and the resolver is what reads it.
 *
 * This is also the only place `connect`'s hosted branch runs at all: nothing offline can tell a
 * URL and a token passed in the right order from a pair that were swapped.
 */
const hostedDatabase = () => {
	const resolution = resolveDatabase({
		CONTROL_PLANE_DATABASE_URL: credential('CONTROL_PLANE_LIVE_TEST_DATABASE_URL'),
		CONTROL_PLANE_DATABASE_TOKEN: credential('CONTROL_PLANE_LIVE_TEST_DATABASE_TOKEN')
	});

	assert.ok(
		'configured' in resolution,
		`CONTROL_PLANE_LIVE_TEST_DATABASE_URL cannot be opened: ${'refusal' in resolution ? resolution.refusal : ''}`
	);

	const { configured } = resolution;

	assert.equal(
		configured.kind,
		'hosted',
		'CONTROL_PLANE_LIVE_TEST_DATABASE_URL names a local file, so a live run would never reach a network'
	);

	const client = connect(configured);

	return { client, db: database(client), describedAs: describeDatabase(configured) };
};

const MIGRATIONS = fileURLToPath(new URL('../../../migrations', import.meta.url));

/**
 * A distinct identity per run, rather than `SOMEBODY`.
 *
 * The database is reused, so a run whose cleanup failed leaves rows behind, and a fixed subject
 * would make the next run sign in as that leftover account and assert against somebody else's
 * mess. A subject nobody else will produce makes each run's rows its own and makes the cleanup
 * below unambiguous about what it is removing.
 */
const identityFor = (run: number) => ({
	subject: `live-control-plane-${run}`,
	email: `live-${run}@example.com`,
	displayName: 'A Live Run',
	avatarUrl: null
});

/**
 * Every row this run wrote, in reverse dependency order.
 *
 * **Keyed on the Google subject rather than on an account id the test observed.** The account row
 * is written by the sign-in hook before provisioning runs, so a sign-in that failed part-way
 * leaves an account behind and answers with no `account` for a test to read an id out of. The
 * subject is known before the request is sent, which makes this reachable on exactly the paths
 * that leak. It is also why it is called unconditionally rather than behind a guard.
 */
const removeEverythingFor = async (
	db: ReturnType<typeof database>,
	subject: string
): Promise<void> => {
	try {
		const [found] = await db
			.select({ id: account.id })
			.from(account)
			.where(eq(account.googleUserId, subject));

		if (!found) return;

		await db.delete(session).where(eq(session.accountId, found.id));
		await db.delete(membership).where(eq(membership.accountId, found.id));
		await db.delete(workspace).where(eq(workspace.ownerAccountId, found.id));
		await db.delete(account).where(eq(account.id, found.id));
	} catch (refusal) {
		// Named rather than swallowed: a cleanup that failed has left rows in a database somebody
		// else will run against, and which subject they belong to is the only thing that helps.
		console.error(`the rows for ${subject} were left behind in the test database`, refusal);
		throw refusal;
	}
};

// Criterion 6, and what keeps it true afterwards. `migrate` is idempotent, so this applies whatever
// the human's own `pnpm db:migrate:control-plane` has not, and then asks the database what it has
// rather than asking the migration what it would have done.
test('every migration in this build applies to a hosted database', skipped, async () => {
	const { client, db, describedAs } = hostedDatabase();

	try {
		assert.match(describedAs, /^hosted /, `the live test database resolved as ${describedAs}`);

		await migrate(db, { migrationsFolder: MIGRATIONS });

		const present = new Set(
			(
				await client.execute(
					"SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
				)
			).rows.map((row) => String(row.name))
		);

		for (const table of ['account', 'workspace', 'membership', 'session']) {
			assert.ok(present.has(table), `${table} is not in the hosted database after migrating`);
		}

		// `__drizzle_migrations` is the migrator's own default ledger, read from drizzle-orm 0.45.2
		// rather than remembered. One row per file is what says the whole run applied rather than a
		// prefix of it.
		//
		// **The migrator counts `meta/_journal.json`'s entries, not this directory listing.** They
		// agree today and the spec asks for the file form, so that is what this checks. Where they
		// stop agreeing, a `.sql` added without a journal entry, this fails naming the remote for a
		// fault that is entirely on disk. Read the journal before believing the message.
		const files = (await readdir(MIGRATIONS)).filter((name) => name.endsWith('.sql'));
		const applied = await client.execute('SELECT count(*) AS applied FROM __drizzle_migrations');

		assert.ok(files.length > 0, 'this build ships no migrations, so nothing was checked');
		assert.equal(
			Number(applied.rows[0]?.applied),
			files.length,
			'the hosted database has applied a different number of migrations than this build ships'
		);
	} finally {
		client.close();
	}
});

// Criterion 7, first half: the real routes, served from the hosted database, with the rows read
// back out of it by a separate query rather than trusted from the answer.
test('the control plane serves a sign-in from a hosted database', skipped, async () => {
	const { client, db } = hostedDatabase();
	const identity = identityFor(Date.now());
	const turso = tursoInMemory();

	// **The workspace's own database is a file this test owns.** The mint has to migrate one: the
	// route's declared body puts `minimum: 1` on `schemaVersion` and a workspace just created sits
	// at 0, so there is no version a client may legally ask for that leaves it where it is. Backing
	// it with a file is what keeps a Turso workspace database out of this while still putting the
	// mint's own reads and writes, which are against the control plane's records, over the wire.
	const workspaces = await workspaceDatabases();

	let accountId: string | undefined;

	const { url, close } = await runningControlPlane({
		db,
		verifyIdentity: googleVouchingFor(identity),
		platform: turso.platform,
		connectToWorkspace: workspaces.connect
	});

	try {
		await migrate(db, { migrationsFolder: MIGRATIONS });

		const health = await fetch(`${url}/health`);

		assert.equal(health.status, 200, 'the health route could not reach the hosted database');
		assert.equal((await answerOf(health)).status, 'ok');

		const answer = await answerOf(await post(url, '/account/sign-in'));

		assert.ok(answer.account, 'signing in against the hosted database reached no account');
		assert.ok(answer.session, 'signing in against the hosted database bought no session');
		assert.ok(answer.workspace, 'signing up against the hosted database brought no workspace');

		accountId = answer.account.id;

		// --- read back out of the hosted database, not out of the answer ---------------------------
		const stored = await db.select().from(account).where(eq(account.id, accountId));

		assert.equal(stored.length, 1, 'the account the route answered with is not in the database');
		assert.equal(stored[0]?.googleUserId, identity.subject);

		const owned = await db.select().from(workspace).where(eq(workspace.ownerAccountId, accountId));

		assert.equal(owned.length, 1, `the account owns ${owned.length} workspaces after one sign-up`);
		assert.equal(owned[0]?.id, answer.workspace.id);

		const belongs = await db.select().from(membership).where(eq(membership.accountId, accountId));

		assert.equal(belongs.length, 1, 'the sign-up wrote no membership row');
		assert.equal(belongs[0]?.workspaceId, answer.workspace.id);

		const live = await db.select().from(session).where(eq(session.accountId, accountId));

		assert.equal(live.length, 1, 'the session the route answered with is not in the database');

		// **Requirement 7's last clause: a mint returns a token.** Acceptance criterion 7 omits it and
		// the requirement does not, so the requirement is what this follows.
		//
		// At the version this build ships, which is the only kind of ask the route accepts.
		const clientVersion = await targetSchemaVersion();

		const mint = await post(url, `/workspace/${answer.workspace.id}/token`, {
			token: answer.session.token,
			body: { schemaVersion: clientVersion }
		});

		assert.equal(mint.status, 200, 'the mint refused a client at the version this build ships');

		const minted = await answerOf(mint);

		assert.ok(minted.token, 'the mint answered with no token');
		assert.ok(
			minted.url?.startsWith('libsql://'),
			'the mint answered with no workspace url to sync against'
		);

		// The mint's *write* against the hosted database: the version it reached is recorded on the
		// workspace row, read back out rather than trusted from the answer.
		const [moved] = await db
			.select()
			.from(workspace)
			.where(eq(workspace.id, answer.workspace.id))
			.limit(1);

		assert.equal(
			moved?.schemaVersion,
			clientVersion,
			'the hosted database did not record the version the mint reached'
		);

		// **One workspace database was asked for, and a stub is what answered.** An earlier version
		// asserted zero here, which contradicted the assertion above it: sign-up creates a workspace,
		// so a run where nothing was asked for is a run where sign-up did not happen. What keeps this
		// off a real account is `tursoInMemory()` being the platform, not the count being zero.
		assert.equal(turso.databases.size, 1, 'sign-up asked the platform for no workspace database');
		// Two tokens, not one, and the number is not the point: the migration path mints one to open
		// the workspace database and the mint issues the one it hands back. What is asserted is that
		// every token was for a database this test's own stub created, so nothing was minted against
		// a real account.
		assert.ok(turso.minted.length > 0, 'the mint issued no workspace token');
		assert.deepEqual(
			[...new Set(turso.minted.map((one) => one.database))],
			[...turso.databases],
			'a token was minted for a database this test did not create'
		);
		// Opened at least once rather than exactly once: how many connections the migration path
		// makes is its own business and counting them here would be arithmetic about internals. That
		// it opened *something*, and that the something was a file in a temporary directory, is the
		// property, and it is what says the migration went nowhere near Turso.
		assert.ok(
			workspaces.opened.length > 0,
			'the mint opened no workspace database, so it migrated nothing'
		);
	} finally {
		await close();
		await workspaces.close();

		try {
			await removeEverythingFor(db, identity.subject);
		} finally {
			client.close();
		}
	}
});

/**
 * Criterion 7, second half: a transaction that throws part-way through leaves none of its writes.
 *
 * **Asserted directly rather than through `createWorkspace`.** Its own rollback path cannot serve
 * here, because the losing side of the race throws `RaceLost` before it has written anything, so
 * there is nothing to roll back that anybody could observe. That was found while planning and the
 * spec records the correction.
 *
 * What this establishes is that drizzle's `db.transaction()`, which it implements by calling the
 * client's own, is honoured by the remote rather than degrading into unrelated statements that each
 * commit on their own.
 */
test('a transaction that throws leaves nothing behind in a hosted database', skipped, async () => {
	const { client, db } = hostedDatabase();
	const identity = identityFor(Date.now());
	const now = new Date();

	try {
		await migrate(db, { migrationsFolder: MIGRATIONS });

		const rolledBack = new Error('the reason this transaction did not finish');

		await assert.rejects(
			db.transaction(async (tx) => {
				await tx.insert(account).values({
					id: identity.subject,
					email: identity.email,
					displayName: identity.displayName,
					avatarUrl: identity.avatarUrl,
					googleUserId: identity.subject,
					createdAt: now,
					updatedAt: now
				});

				// The row is visible inside the transaction, which is what makes the absence below a
				// rollback rather than an insert that never happened.
				assert.equal(
					(await tx.select().from(account).where(eq(account.id, identity.subject))).length,
					1,
					'the insert did not take effect inside its own transaction'
				);

				throw rolledBack;
			}),
			// Identity rather than a matcher: drizzle rolls back and rethrows the original unchanged,
			// so anything else is the remote behaving differently. **Two paths report badly here and
			// neither passes wrongly**: if the rollback itself throws, its error replaces this one and
			// the failure reads as a predicate that returned false; the inner assertion surfaces the
			// same way. Read the transaction body before reading the predicate.
			(thrown: unknown) => thrown === rolledBack
		);

		const survived = await db.select().from(account).where(eq(account.id, identity.subject));

		assert.equal(
			survived.length,
			0,
			'the remote committed a write from a transaction that threw, so it is not honouring the transaction'
		);
	} finally {
		// Belt and braces: if the assertion above failed because the row survived, it is still this
		// test's row and it does not belong in a database the next run reads.
		await db
			.delete(account)
			.where(eq(account.id, identity.subject))
			.catch(() => {});

		client.close();
	}
});

/**
 * The cheapest statement that proves the connection answers at all.
 *
 * **What stops a live run being a local one is `hostedDatabase` refusing anything but a hosted
 * configuration**, and that is asserted there rather than here, so this does not repeat it. What
 * this adds is that the client on the other side of that refusal actually responds: a run where
 * every other test failed on a migration would otherwise leave open whether the database was
 * reachable and wrong, or not reachable at all.
 */
test('the hosted database answers', skipped, async () => {
	const { client, describedAs } = hostedDatabase();

	try {
		const answer = await database(client).get<{ answer: number }>(sql`select 1 as answer`);

		assert.equal(answer?.answer, 1, `${describedAs} answered nothing`);
	} finally {
		client.close();
	}
});
