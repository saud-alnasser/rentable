import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
	connect,
	describe as describeDatabase,
	resolveDatabase,
	tokenExpiry,
	type Resolution
} from '../database.ts';

/**
 * Acceptance criteria 1 through 5 of *the control plane keeps its records on turso*: a database
 * that cannot work is refused at startup, and what the process says about the one it got carries
 * no credential.
 *
 * **The resolver is covered directly because it is pure.** It takes its environment as an argument
 * rather than reaching for `process.env`, which is what puts four of the five criteria at the level
 * [[rules/testing]] covers pure logic at. Only the fifth needs a process, and only because what it
 * asserts is that a refusal *ends* one rather than returning a sentence somebody could ignore.
 *
 * `describe` is imported under another name here. It is this repository's function, not
 * `node:test`'s suite, and the two reading alike in a test file is a trap worth spending a word on.
 */
const HOSTED = 'libsql://cp-rentable-example.turso.io';

/** never a real one. It is asserted *absent* from what the process announces. */
const TOKEN = 'a-token-that-nothing-may-print';

const refusalOf = (resolution: Resolution): string => {
	assert.ok('refusal' in resolution, 'expected a refusal and got a configuration');

	return resolution.refusal;
};

// `assert.fail` rather than `assert.ok` with a message. An assertion's message is built before the
// assertion runs, so a message reading `refusalOf(resolution)` calls a function that asserts there
// is a refusal, and every configuration that passed failed on the sentence written to explain a
// failure. Four tests did exactly that before this line existed.
const configuredBy = (env: NodeJS.ProcessEnv) => {
	const resolution = resolveDatabase(env);

	if ('refusal' in resolution)
		assert.fail(`expected a configuration and got: ${resolution.refusal}`);

	return resolution.configured;
};

// Criterion 1. Until #755 this case was the one input with no refusal at all: it fell back to
// `file:./control-plane.db`, so a process meant for the hosted database built a stray file beside
// itself and served every account out of it.
test('a database that is not configured is refused, and the refusal says which variable and where', () => {
	for (const env of [
		{},
		{ CONTROL_PLANE_DATABASE_URL: '' },
		{ CONTROL_PLANE_DATABASE_URL: '  \t ' }
	]) {
		const refusal = refusalOf(resolveDatabase(env));

		assert.match(refusal, /CONTROL_PLANE_DATABASE_URL/);
		assert.match(refusal, /\.env\.example/);
	}
});

// Also criterion 1, and the reason the refusal is worded here rather than left to `new URL`:
// `ERR_INVALID_URL` says only "Invalid URL", which names neither the variable nor the fix.
test('a URL with no scheme is refused for the scheme it is missing', () => {
	const refusal = refusalOf(resolveDatabase({ CONTROL_PLANE_DATABASE_URL: './control-plane.db' }));

	assert.match(refusal, /CONTROL_PLANE_DATABASE_URL/);
	assert.match(refusal, /scheme/);
	assert.match(refusal, /\.env\.example/);
});

// Criterion 2. A whitespace-only token is the case worth spelling out: it is what a copied line
// with nothing after the `=` leaves behind, and untrimmed it is a token as far as the client is
// concerned, which turns into a 503 with no cause at the first query.
test('a hosted database is refused without a token, however the token is blank', () => {
	const blank = [
		{ CONTROL_PLANE_DATABASE_URL: HOSTED },
		{ CONTROL_PLANE_DATABASE_URL: HOSTED, CONTROL_PLANE_DATABASE_TOKEN: '' },
		{ CONTROL_PLANE_DATABASE_URL: HOSTED, CONTROL_PLANE_DATABASE_TOKEN: '  \t ' }
	];

	for (const env of blank) {
		assert.match(refusalOf(resolveDatabase(env)), /CONTROL_PLANE_DATABASE_TOKEN/);
	}

	assert.deepEqual(
		configuredBy({ CONTROL_PLANE_DATABASE_URL: HOSTED, CONTROL_PLANE_DATABASE_TOKEN: TOKEN }),
		{ kind: 'hosted', url: HOSTED, authToken: TOKEN }
	);
});

test('both values are trimmed before they are judged', () => {
	assert.deepEqual(
		configuredBy({
			CONTROL_PLANE_DATABASE_URL: `  ${HOSTED}  `,
			CONTROL_PLANE_DATABASE_TOKEN: `\t${TOKEN}\n`
		}),
		{ kind: 'hosted', url: HOSTED, authToken: TOKEN }
	);
});

// Criterion 3. A local file stays legal, needs no token, and says which file it is.
test('a file URL is local, needs no token, and is announced as local', () => {
	const configured = configuredBy({ CONTROL_PLANE_DATABASE_URL: 'file:./control-plane.db' });

	assert.deepEqual(configured, { kind: 'local', url: 'file:./control-plane.db' });
	assert.equal(describeDatabase(configured), 'local file ./control-plane.db');
});

// The path is the configured spelling rather than `new URL(...).pathname`, which resolves a
// relative file URL to `/control-plane.db` and would report a file beside the process as one at
// the filesystem root.
test('a relative file is not announced as an absolute one', () => {
	const configured = configuredBy({ CONTROL_PLANE_DATABASE_URL: 'file:./data/control-plane.db' });

	assert.equal(describeDatabase(configured), 'local file ./data/control-plane.db');
	assert.equal(
		describeDatabase({ kind: 'local', url: 'file:/var/lib/control-plane.db' }),
		'local file /var/lib/control-plane.db'
	);
});

// Criterion 4, both halves. libSQL takes a token from the URL's query as well as from the client's
// options, so the announcement is built from the scheme and the host rather than passed through,
// and a URL that carries one is refused rather than printed.
test('what the process announces identifies the database and carries no credential', () => {
	const announced = describeDatabase({ kind: 'hosted', url: HOSTED, authToken: TOKEN });

	// `TOKEN` is a sentence rather than a JWT, so the expiry reads as unreadable. That is criterion
	// 3's outcome arriving in criterion 4's test, and it is the right one: a token this function
	// cannot decode must still leave a line that identifies the database and carries no credential.
	assert.equal(announced, 'hosted libsql://cp-rentable-example.turso.io, token expiry unreadable');
	assert.ok(!announced.includes(TOKEN), 'the announcement carries the token');
	assert.ok(!announced.includes('?'), 'the announcement carries a query string');
});

// **The token is set here as well, and both halves of that matter.** With it unset, removing the
// query guard would leave the same input refused by the blank-token rule instead, in a sentence
// that still names `CONTROL_PLANE_DATABASE_TOKEN` and still omits the token, so the test would pass
// over a deleted guard. Matching the words only this refusal uses is the other half.
test('a URL carrying the token in its query is refused rather than accepted quietly', () => {
	const refusal = refusalOf(
		resolveDatabase({
			CONTROL_PLANE_DATABASE_URL: `${HOSTED}?authToken=${TOKEN}`,
			CONTROL_PLANE_DATABASE_TOKEN: TOKEN
		})
	);

	assert.match(refusal, /carries an authToken in its query/);
	assert.match(refusal, /CONTROL_PLANE_DATABASE_TOKEN/);
	assert.ok(!refusal.includes(TOKEN), 'the refusal repeats the token back');
});

// Both of these parse, so neither reaches the missing-scheme refusal, and with a token set they
// would each be taken for a hosted database. The Windows path is the one that matters: a drive
// letter is a scheme as far as `new URL` is concerned, and this repository is developed on Windows.
test('a URL that names no host is refused rather than taken for a hosted database', () => {
	for (const url of ['C:/dev/control-plane.db', 'libsql:cp-rentable-example.turso.io']) {
		const refusal = refusalOf(
			resolveDatabase({ CONTROL_PLANE_DATABASE_URL: url, CONTROL_PLANE_DATABASE_TOKEN: TOKEN })
		);

		assert.match(refusal, /CONTROL_PLANE_DATABASE_URL/);
		assert.match(refusal, /host/);
	}
});

// `connect` is the other thing this ticket changed, and nothing else in the suite runs it: every
// test builds its own client with `createClient`. Without this, transposing the URL and the token
// inside it leaves all of the suite green while every entrypoint opens a database that is not
// there. The hosted half of the same function is #757's live test, which is where a token can be
// checked at all.
test('a local configuration opens the file it names', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'control-plane-connect-'));
	const file = join(directory, 'control-plane.db');
	const client = connect({ kind: 'local', url: `file:${file}` });

	try {
		await client.execute('create table probe (answer integer not null)');
		await client.execute('insert into probe (answer) values (1)');

		assert.equal((await client.execute('select answer from probe')).rows[0]?.answer, 1);

		// **The file, not only the answer.** A `select 1` succeeds against any database that opens,
		// so a `connect` handed the wrong URL would answer it and this test would pass over the
		// defect. What is asserted is that the configured path is the one that now exists.
		assert.ok((await stat(file)).size > 0, 'connect opened a database somewhere else');
	} finally {
		client.close();

		// The retries and the swallow are `../../tests/testing.ts`'s, for its reason: Windows does
		// not release the handle the instant the client is closed, and a temporary file this test
		// could not remove is not a reason to fail the thing it was testing.
		await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).catch(
			() => {}
		);
	}
});

/**
 * Acceptance criteria 1 through 6 of *the control plane says when its token expires*.
 *
 * **The token is built here rather than mocked**, which is what keeps every one of these off the
 * network and off the account. Nothing verifies the signature, so the third segment is a constant;
 * what is under test is the claim in the middle one and the sentence it produces.
 */
const jwtExpiringAt = (exp: unknown): string =>
	[
		Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
		Buffer.from(JSON.stringify({ id: 'a-database-id', exp })).toString('base64url'),
		'not-a-signature-and-never-read'
	].join('.');

/** the deadline the live tokens carry, per [[references/turso]]: minted 2026-08-23 for 52 weeks. */
const EXPIRES_AT = Date.UTC(2027, 7, 22);
const MINTED_AT = Date.UTC(2026, 7, 23);
const LIVE_TOKEN = jwtExpiringAt(EXPIRES_AT / 1000);

const at = (ms: number) => () => ms;

const hosted = (authToken: string) => ({ kind: 'hosted', url: HOSTED, authToken }) as const;

// Criterion 1. The date is stated rather than computed, which is what makes a unit error impossible
// to hide: reading `exp` as milliseconds puts this deadline in 1970 and the assertion prints it.
test('a hosted database announces when its token expires and how long is left', () => {
	assert.equal(
		describeDatabase(hosted(LIVE_TOKEN), at(MINTED_AT)),
		'hosted libsql://cp-rentable-example.turso.io, token expires 2027-08-22 (364 days left)'
	);
});

// The counts either side of a day, because `0 days left` is the line somebody reads on the day it
// matters and the one that must not say nothing.
test('the count falls to hours inside the last day, and to neither inside the last hour', () => {
	const before = (hours: number) => at(EXPIRES_AT - hours * 60 * 60 * 1000);

	assert.match(describeDatabase(hosted(LIVE_TOKEN), before(25)), /\(1 day left\)$/);
	assert.match(describeDatabase(hosted(LIVE_TOKEN), before(23)), /\(23 hours left\)$/);
	assert.match(describeDatabase(hosted(LIVE_TOKEN), before(1)), /\(1 hour left\)$/);
	assert.match(describeDatabase(hosted(LIVE_TOKEN), at(EXPIRES_AT - 1)), /\(under an hour left\)$/);
});

// Criterion 2. The consequence in words, because when this line is printed the control plane is
// already answering 503 to everything from a route that keeps its reason out of the body, and this
// is the only place the cause is written down.
test('a token past its expiry says so, and says what it costs', () => {
	assert.equal(
		describeDatabase(hosted(LIVE_TOKEN), at(EXPIRES_AT + 1)),
		'hosted libsql://cp-rentable-example.turso.io, token EXPIRED 2027-08-22 (every query will fail)'
	);

	// The boundary itself. A token whose deadline is exactly now has no time left, and a `>=` here
	// would announce `under an hour left` on a credential the remote has already stopped taking.
	assert.match(describeDatabase(hosted(LIVE_TOKEN), at(EXPIRES_AT)), /EXPIRED/);
});

// Criterion 3. Every shape that is not a readable claim, and the second half of each: the database
// still resolves. Turso mints JWTs today, and a token that stops being one is a fact about the
// token rather than grounds to refuse a database that may work perfectly.
test('a token whose expiry cannot be read says so, and does not stop the database resolving', () => {
	const header = Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url');

	const unreadable = [
		['not a JWT at all', 'a-token-that-nothing-may-print'],
		['two segments rather than three', 'header.payload'],
		[
			'a payload that is not an object',
			`${header}.${Buffer.from('"exp"').toString('base64url')}.sig`
		],
		[
			'a payload that is not JSON',
			`${header}.${Buffer.from('not json').toString('base64url')}.sig`
		],
		['no exp claim', jwtExpiringAt(undefined)],
		['an exp that is not a number', jwtExpiringAt('soon')],
		['an exp that is null', jwtExpiringAt(null)]
	] as const;

	for (const [why, token] of unreadable) {
		assert.equal(
			describeDatabase(hosted(token), at(MINTED_AT)),
			'hosted libsql://cp-rentable-example.turso.io, token expiry unreadable',
			`${why} was not announced as unreadable`
		);

		assert.deepEqual(
			configuredBy({
				CONTROL_PLANE_DATABASE_URL: HOSTED,
				CONTROL_PLANE_DATABASE_TOKEN: token
			}),
			{ kind: 'hosted', url: HOSTED, authToken: token },
			`${why} stopped the database resolving`
		);
	}
});

// Criterion 4. The refusals are what four acceptance criteria of the turso effort pinned, and this
// effort must not add a fifth. An expired token is the case that would tempt one: it cannot work,
// which is the exact wording of the guard beside it, and it is still not grounds to refuse, because
// the claim is unverified and the clock is this machine's.
test('an expired token is announced rather than refused, and no fifth refusal was added', () => {
	const expired = jwtExpiringAt(Date.UTC(2020, 0, 1) / 1000);

	assert.deepEqual(
		configuredBy({
			CONTROL_PLANE_DATABASE_URL: HOSTED,
			CONTROL_PLANE_DATABASE_TOKEN: expired
		}),
		{ kind: 'hosted', url: HOSTED, authToken: expired }
	);

	// The four that do refuse, named here so that losing one is a failing test rather than a quiet
	// loosening. Each carries the expired token where it takes one, so none of them can be passing
	// for the new reason instead of its own.
	assert.match(refusalOf(resolveDatabase({})), /CONTROL_PLANE_DATABASE_URL is not set/);
	assert.match(
		refusalOf(
			resolveDatabase({
				CONTROL_PLANE_DATABASE_URL: 'not a url',
				CONTROL_PLANE_DATABASE_TOKEN: expired
			})
		),
		/is not a URL/
	);
	assert.match(
		refusalOf(
			resolveDatabase({
				CONTROL_PLANE_DATABASE_URL: `${HOSTED}?authToken=x`,
				CONTROL_PLANE_DATABASE_TOKEN: expired
			})
		),
		/carries an authToken in its query/
	);
	assert.match(
		refusalOf(resolveDatabase({ CONTROL_PLANE_DATABASE_URL: HOSTED })),
		/CONTROL_PLANE_DATABASE_TOKEN is not set/
	);
});

// Criterion 5. The token is the one thing on this line that must never reach a log, and the expiry
// is decoded out of it, so every branch is checked rather than the one printed most often.
test('no announcement carries the token, or any segment of it', () => {
	const segments = LIVE_TOKEN.split('.');

	for (const now of [at(MINTED_AT), at(EXPIRES_AT + 1)]) {
		const announced = describeDatabase(hosted(LIVE_TOKEN), now);

		assert.ok(!announced.includes(LIVE_TOKEN), 'the announcement carries the whole token');

		for (const segment of segments) {
			assert.ok(
				!announced.includes(segment),
				`the announcement carries a segment of the token: ${segment.slice(0, 12)}`
			);
		}
	}
});

// The decode under the sentence. `describe` is what four entrypoints print, and this is what it
// reads; covering only the formatted line would pin the decode to a string somebody may reword.
test('the exp claim is read in seconds, against a clock in milliseconds', () => {
	assert.deepEqual(tokenExpiry(LIVE_TOKEN, at(MINTED_AT)), {
		standing: 'live',
		expiresAt: EXPIRES_AT,
		remainingMs: EXPIRES_AT - MINTED_AT
	});

	assert.deepEqual(tokenExpiry(LIVE_TOKEN, at(EXPIRES_AT + 1)), {
		standing: 'expired',
		expiresAt: EXPIRES_AT
	});

	assert.deepEqual(tokenExpiry('', at(MINTED_AT)), { standing: 'unreadable' });
});

const SOURCE = fileURLToPath(new URL('../../', import.meta.url));
const PACKAGE = fileURLToPath(new URL('../../../', import.meta.url));

// Global, because a file may split its imports across two statements and `exec` would judge it on
// whichever came first.
const NAMED_IMPORTS = /import\s+\{([^}]*)\}\s+from\s+'\.\/database\/database\.ts'/g;

/**
 * Criterion 5, asserted structurally in the style `../../tests/boundary.test.ts` already uses.
 *
 * Covering it entrypoint by entrypoint would only cover the ones somebody remembered to list, and
 * the failure this guards against arrives *with* a fifth entrypoint. So the list is fixed here
 * instead: exactly these four open the database, each through `connectOrExit`, and a new one is a
 * decision somebody has to come here and take.
 */
test('every entrypoint refuses alike, because every one of them opens through connectOrExit', async () => {
	const opens: string[] = [];

	for (const entry of await readdir(SOURCE, { withFileTypes: true })) {
		if (!entry.isFile() || !entry.name.endsWith('.ts')) continue;

		const text = await readFile(resolve(SOURCE, entry.name), 'utf8');
		const clauses = [...text.matchAll(NAMED_IMPORTS)];

		if (clauses.length === 0) continue;

		const named = clauses.flatMap((clause) =>
			(clause[1] ?? '')
				.split(',')
				.map((name) => name.trim())
				.filter(Boolean)
		);

		assert.ok(
			named.includes('connectOrExit'),
			`${entry.name} opens the control plane's database without connectOrExit, so it cannot refuse`
		);
		assert.ok(
			!named.includes('connect'),
			`${entry.name} reaches for connect directly, which takes a resolved configuration and refuses nothing`
		);

		opens.push(entry.name);
	}

	assert.deepEqual(opens.sort(), ['decline.ts', 'main.ts', 'prune.ts', 'sweep.ts']);
});

/**
 * The other half of the guard above, which reads what an entrypoint *imports*.
 *
 * A fifth entrypoint that opened the control plane's database with `createClient` and its own
 * `process.env` read would import nothing from this module, so the list above would never see it
 * and would still hold. `main.ts` and `sweep.ts` already import `createClient` for a *workspace's*
 * database, so the import itself cannot be the thing forbidden. Where the two variables are read
 * can be: in `database/database.ts`, and nowhere a process starts.
 */
test('no entrypoint reads the database variables for itself', async () => {
	for (const entry of await readdir(SOURCE, { withFileTypes: true })) {
		if (!entry.isFile() || !entry.name.endsWith('.ts')) continue;

		assert.doesNotMatch(
			await readFile(resolve(SOURCE, entry.name), 'utf8'),
			/CONTROL_PLANE_DATABASE_(URL|TOKEN)/,
			`${entry.name} reads the database variables itself rather than through resolveDatabase`
		);
	}
});

/**
 * The other half of criterion 5: the refusal ends a process rather than returning a sentence.
 *
 * `prune-sessions` is the cheapest of the four to spawn, because it opens the database and needs
 * nothing else. **A blanked variable rather than an absent one is what makes this honest**:
 * `dotenv` does not override a key already present in `process.env`, and an empty string counts as
 * present, so this refuses on a machine whose `.env` names a database too.
 */
test('a refusal ends the process, and says so where a person will read it', () => {
	const run = spawnSync(process.execPath, ['--import', 'tsx', resolve(PACKAGE, 'src/prune.ts')], {
		cwd: PACKAGE,
		encoding: 'utf8',
		env: { ...process.env, CONTROL_PLANE_DATABASE_URL: '' }
	});

	const said = `${run.stdout ?? ''}${run.stderr ?? ''}`;

	assert.notEqual(run.status, 0, `prune-sessions exited ${run.status} with nothing configured`);
	assert.match(said, /CONTROL_PLANE_DATABASE_URL/);
	assert.match(said, /\.env\.example/);
});
