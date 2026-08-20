import assert from 'node:assert/strict';
import test from 'node:test';

import type { Database } from '../../database/database.ts';
import type { VerifyGoogleIdentity } from '../../account/google.ts';

import {
	CLIENT_OUT_OF_DATE,
	MALFORMED,
	NOT_VERIFIED,
	Refusal,
	SESSION_EXPIRED,
	SESSION_LIFETIME_REACHED,
	UNAUTHENTICATED
} from '../../failure.ts';
import { workspace as workspaceTable } from '../../database/schema.ts';
import { declineRenewal } from '../../session/session.ts';
import { targetSchemaVersion } from '../../workspace/migration.ts';
import {
	answerOf,
	freshDatabase,
	googleVouchingFor,
	post,
	runningControlPlane,
	SOMEBODY,
	tursoInMemory,
	workspaceDatabases
} from '../../tests/testing.ts';

const AT = Date.UTC(2026, 7, 18, 12, 0, 0);
const A_DAY = 24 * 60 * 60 * 1000;

const withControlPlane = async (
	verifyIdentity: VerifyGoogleIdentity,
	run: (reached: {
		url: string;
		db: Database;
		turso: ReturnType<typeof tursoInMemory>;
		hosted: Awaited<ReturnType<typeof workspaceDatabases>>;
		/**
		 * move the clock the routes read.
		 *
		 * Requirement 15 is three days passing, and the only reason it is testable at all is that
		 * the control plane takes `now` as an argument rather than reaching for `Date.now`. This
		 * moves that argument and nothing on the machine.
		 */
		moveClockTo: (moment: number) => void;
	}) => Promise<void>,
	turso: ReturnType<typeof tursoInMemory> = tursoInMemory()
) => {
	const { db, close: closeDatabase } = await freshDatabase();
	const hosted = await workspaceDatabases();
	let now = AT;
	const { url, close } = await runningControlPlane({
		db,
		verifyIdentity,
		platform: turso.platform,
		connectToWorkspace: hosted.connect,
		now: () => now
	});

	try {
		await run({
			url,
			db,
			turso,
			hosted,
			moveClockTo: (moment) => {
				now = moment;
			}
		});
	} finally {
		await close();
		await hosted.close();
		await closeDatabase();
	}
};

test('signing in reaches an account', async () => {
	await withControlPlane(googleVouchingFor(SOMEBODY), async ({ url }) => {
		const response = await post(url, '/account/sign-in');

		assert.equal(response.status, 200);

		const { account } = await answerOf(response);

		assert.ok(account, 'no account came back');
		assert.equal(account.email, SOMEBODY.email);
		assert.equal(account.displayName, SOMEBODY.displayName);
		assert.equal(account.googleUserId, SOMEBODY.subject);
		assert.equal(account.createdAt, AT, 'timestamps go out as epoch milliseconds');
		assert.ok(account.id);
	});
});

test('signing in twice reaches one account, over the wire as well', async () => {
	await withControlPlane(googleVouchingFor(SOMEBODY), async ({ url }) => {
		const first = await answerOf(await post(url, '/account/sign-in'));
		const second = await answerOf(await post(url, '/account/sign-in'));

		assert.ok(first.account && second.account);
		assert.equal(second.account.id, first.account.id);
	});
});

// Acceptance criterion 3 of #555: refused, typed, and the message names the action.
test('a sign-in Google will not vouch for is refused with a code and an action', async () => {
	const refusing = async () => {
		throw new Refusal(NOT_VERIFIED, 401, 'google would not confirm this sign-in. sign in again');
	};

	await withControlPlane(refusing, async ({ url }) => {
		const response = await post(url, '/account/sign-in', { token: 'a-stale-token' });

		assert.equal(response.status, 401);

		const { error } = await answerOf(response);

		assert.ok(error, 'the refusal carried no error');
		assert.equal(error.code, NOT_VERIFIED);
		assert.match(error.message, /sign in again/);
	});
});

// Presenting nothing is not the same as presenting something Google refused, and the caller's
// next move differs: one is a bug in the client, the other is a stale credential.
test('a request with no credential is unauthenticated, not refused by Google', async () => {
	await withControlPlane(googleVouchingFor(SOMEBODY), async ({ url }) => {
		for (const token of [null, '', 'Basic']) {
			const response = await fetch(`${url}/account/sign-in`, {
				method: 'POST',
				headers: token === null ? {} : { authorization: token }
			});

			assert.equal(response.status, 401);
			assert.equal((await answerOf(response)).error?.code, UNAUTHENTICATED);
		}
	});
});

test('an unexpected failure tells the caller nothing about this process', async () => {
	const exploding = async () => {
		throw new Error('libsql: no such table: account_v2');
	};

	await withControlPlane(exploding, async ({ url }) => {
		const response = await post(url, '/account/sign-in');

		assert.equal(response.status, 500);

		const body = await response.text();

		assert.equal(body.includes('account_v2'), false, 'the internal message went out');
		assert.equal(JSON.parse(body).error.code, 'unavailable');
	});
});

test('health answers only after the database does', async () => {
	await withControlPlane(googleVouchingFor(SOMEBODY), async ({ url }) => {
		const response = await fetch(`${url}/health`);

		assert.equal(response.status, 200);
		assert.deepEqual(await response.json(), { status: 'ok' });
	});
});

test('a route that does not exist is a 404 rather than a sign-in', async () => {
	await withControlPlane(googleVouchingFor(SOMEBODY), async ({ url }) => {
		assert.equal((await fetch(`${url}/account/sign-in`)).status, 404, 'GET is not the sign-in');
		assert.equal((await fetch(`${url}/nothing`)).status, 404);
	});
});

// Acceptance criterion 1, and requirement 3's *in the same act*: signing up provisions the
// database, the record that names it, and the membership, without a second call.
test('signing up provisions a database and a record that names it', async () => {
	await withControlPlane(googleVouchingFor(SOMEBODY), async ({ url, turso }) => {
		const { account, workspace } = await answerOf(await post(url, '/account/sign-in'));

		assert.ok(workspace && account);
		assert.equal(workspace.name, account.displayName, 'a workspace is named for its owner');
		assert.equal(workspace.ownerAccountId, account.id, 'it belongs to somebody else');
		assert.deepEqual([...turso.databases], [`ws-${workspace.id}`], 'no database was provisioned');
	});
});

// Requirement 6: exactly one, held on every path that can make an account rather than only on
// the sign-in route. A Google token presented to the mint creates the account, so it has to
// create the workspace too.
test('an account made by any route gets its workspace with it', async () => {
	await withControlPlane(googleVouchingFor(SOMEBODY), async ({ url, db, turso }) => {
		// The account's first-ever request, and it is not a sign-in.
		await post(url, '/workspace/nope/token', { body: { schemaVersion: 1 } });

		const owned = await db.select().from(workspaceTable);

		assert.equal(owned.length, 1, 'an account was created with no workspace');
		assert.equal(turso.databases.size, 1, 'the workspace has no database');
	});
});

// Signing in twice reaches one workspace, which is the half of requirement 6 the index cannot
// state: the second sign-in must find rather than create.
test('signing in twice reaches one workspace and provisions nothing', async () => {
	await withControlPlane(googleVouchingFor(SOMEBODY), async ({ url, turso }) => {
		const first = await answerOf(await post(url, '/account/sign-in'));
		const second = await answerOf(await post(url, '/account/sign-in'));

		assert.ok(first.workspace && second.workspace);
		assert.equal(second.workspace.id, first.workspace.id);
		assert.equal(turso.databases.size, 1, 'a second sign-in provisioned a second database');
	});
});

test('a body that is not json says so', async () => {
	await withControlPlane(googleVouchingFor(SOMEBODY), async ({ url }) => {
		const { workspace } = await answerOf(await post(url, '/account/sign-in'));

		assert.ok(workspace);

		const response = await post(url, `/workspace/${workspace.id}/token`, {
			body: 'not json at all'
		});

		assert.equal(response.status, 400);
		assert.equal((await answerOf(response)).error?.code, MALFORMED);
	});
});

// Acceptance criterion 2: scoped to one database, and short-lived.
test('the mint issues a token for that one database, with a lifetime', async () => {
	await withControlPlane(googleVouchingFor(SOMEBODY), async ({ url, turso }) => {
		const { workspace } = await answerOf(await post(url, '/account/sign-in'));

		assert.ok(workspace);

		// A workspace is created at version 0 with an empty database, so the first mint always
		// migrates — there is no version a client may send that would skip it.
		const response = await post(url, `/workspace/${workspace.id}/token`, {
			body: { schemaVersion: await targetSchemaVersion() }
		});

		assert.equal(response.status, 200);

		const minted = await answerOf(response);

		assert.ok(minted.token);
		assert.equal(minted.url, `libsql://ws-${workspace.id}-org.aws-eu-west-1.turso.io`);
		assert.equal(minted.expiresAt, AT + 3 * 24 * 60 * 60 * 1000);
		// Two: the half-hour token this service migrated the empty database with, then the
		// client's own three-day one.
		assert.deepEqual(turso.minted, [
			{ database: `ws-${workspace.id}`, expiration: '30m' },
			{ database: `ws-${workspace.id}`, expiration: '3d' }
		]);
	});
});

const aWorkspace = async (url: string) => {
	const { workspace } = await answerOf(await post(url, '/account/sign-in'));

	assert.ok(workspace, 'signing in did not bring a workspace with it');

	return workspace;
};

/**
 * Acceptance criterion 12, over the wire: a migration reaches a hosted workspace, and the client
 * that asked for it gets its token afterwards rather than instead.
 */
test('a client ahead of its workspace has it migrated, and then mints', async () => {
	await withControlPlane(googleVouchingFor(SOMEBODY), async ({ url, hosted }) => {
		const workspace = await aWorkspace(url);
		const schemaVersion = await targetSchemaVersion();

		const response = await post(url, `/workspace/${workspace.id}/token`, {
			body: { schemaVersion }
		});

		assert.equal(response.status, 200);
		assert.ok((await answerOf(response)).token);

		const { rows } = await hosted
			.open(`libsql://ws-${workspace.id}-org.aws-eu-west-1.turso.io`)
			.execute("select name from sqlite_master where type = 'table' and name = 'payment'");

		assert.equal(rows.length, 1, 'the workspace database was never migrated');
	});
});

/**
 * The refusal as a client actually meets it: a code it can act on, a message a person reads, and
 * **no token in the body** — so it issues no write, because it never received a credential.
 */
test('a client behind its workspace is refused by code, and holds no token', async () => {
	await withControlPlane(googleVouchingFor(SOMEBODY), async ({ url, turso }) => {
		const workspace = await aWorkspace(url);

		// The newer client goes first and takes the workspace with it, which is what leaves the
		// older one behind. Nothing here reaches past the routes to arrange it.
		await post(url, `/workspace/${workspace.id}/token`, {
			body: { schemaVersion: await targetSchemaVersion() }
		});

		const minted = turso.minted.length;
		const response = await post(url, `/workspace/${workspace.id}/token`, {
			body: { schemaVersion: (await targetSchemaVersion()) - 1 }
		});

		assert.equal(response.status, 409);

		const answer = await answerOf(response);

		assert.equal(answer.error?.code, CLIENT_OUT_OF_DATE);
		assert.match(answer.error?.message ?? '', /update the application/);
		assert.equal(answer.token, undefined, 'a refused client was handed a token');
		assert.equal(turso.minted.length, minted, 'a refused client cost a mint at Turso');
	});
});

// A default would be a guess about which schema a client understands, and guessing is the thing
// decision 06 exists to stop.
test('a mint that does not say which schema it was built against is malformed', async () => {
	await withControlPlane(googleVouchingFor(SOMEBODY), async ({ url }) => {
		const workspace = await aWorkspace(url);

		for (const body of [
			{},
			{ schemaVersion: 'four' },
			{ schemaVersion: -1 },
			{ schemaVersion: 1.5 }
		]) {
			const response = await post(url, `/workspace/${workspace.id}/token`, { body });

			assert.equal(response.status, 400);
			assert.equal((await answerOf(response)).error?.code, MALFORMED);
		}
	});
});

// #550, acceptance criterion 16. Everything below moves the clock rather than waiting, which is
// the property the design was chosen for: the window is a lifetime issued here, so a test can
// advance past it without advancing anything on the machine.

test('signing in hands back a session, and the window on it is three days', async () => {
	await withControlPlane(googleVouchingFor(SOMEBODY), async ({ url }) => {
		const { session } = await answerOf(await post(url, '/account/sign-in'));

		assert.ok(session, 'signing in handed back no session');
		assert.equal(session.expiresAt, AT + 3 * A_DAY);
		assert.ok(
			session.token.startsWith('rws_'),
			'a session token is not tellable from a google one'
		);
	});
});

// The session is what replaces asking Google on every request, which is what this file's
// `asking` did until now.
test('a session is the credential afterwards, and google is not asked again', async () => {
	let googleAsked = 0;
	const countingVouches: VerifyGoogleIdentity = async () => {
		googleAsked += 1;
		return SOMEBODY;
	};

	await withControlPlane(countingVouches, async ({ url }) => {
		const { session } = await answerOf(await post(url, '/account/sign-in'));
		assert.ok(session);

		// Any route reached with the session rather than with a Google token. It used to be
		// `POST /workspace`, which no longer exists — requirement 6 removed it. The credential was
		// always the first thing that route touched; what changed is that the route is gone.
		const response = await post(url, '/session/refresh', { token: session.token });

		assert.equal(response.status, 200);
		assert.equal(googleAsked, 1, 'the session still cost a round trip to google');
	});
});

// Criterion 16, the half that must not ask: one successful reach inside the window, and the
// window restarts from the reach rather than from the sign-in.
test('a reach inside the window renews the session and restarts the window', async () => {
	await withControlPlane(googleVouchingFor(SOMEBODY), async ({ url, moveClockTo }) => {
		const { session } = await answerOf(await post(url, '/account/sign-in'));
		assert.ok(session);

		const almostOut = AT + 3 * A_DAY - 1;
		moveClockTo(almostOut);

		const refreshed = await answerOf(await post(url, '/session/refresh', { token: session.token }));

		assert.ok(refreshed.session);
		assert.equal(refreshed.session.expiresAt, almostOut + 3 * A_DAY);
		assert.equal(refreshed.session.token, session.token);

		// six days after signing in, three after the one reach, and it is still good.
		moveClockTo(almostOut + 3 * A_DAY - 1);
		assert.equal((await post(url, '/session/refresh', { token: session.token })).status, 200);
	});
});

// Criterion 16, the half that must ask. Sign in, never reach again, move the clock past the
// window: the refusal is typed, and it names the action to take.
// **Criterion 16's first bullet, through the route a client actually reaches.** This asserted a
// refusal at three days until 2026-08-19; requirement 15 made three days the window the *client*
// locks itself on, and reconnecting past it refreshes with nobody typing anything.
test('a session nobody reached for three days refreshes over the wire, and asks for nothing', async () => {
	await withControlPlane(googleVouchingFor(SOMEBODY), async ({ url, moveClockTo }) => {
		const { session } = await answerOf(await post(url, '/account/sign-in'));
		assert.ok(session);

		moveClockTo(AT + 4 * A_DAY);

		const response = await post(url, '/session/refresh', { token: session.token });

		assert.equal(response.status, 200);

		const refreshed = await answerOf(response);

		assert.ok(refreshed.session);
		assert.equal(refreshed.session.token, session.token, 'the client was handed a new sign-in');
		assert.equal(
			refreshed.session.absoluteExpiresAt,
			session.absoluteExpiresAt,
			'reconnecting moved the absolute lifetime'
		);
	});
});

// Criterion 16's second bullet: the month, and it is reached by reaching faithfully rather than
// by going quiet.
test('a sign-in a month old is refused however faithfully it has been reaching', async () => {
	await withControlPlane(googleVouchingFor(SOMEBODY), async ({ url, moveClockTo }) => {
		const { session } = await answerOf(await post(url, '/account/sign-in'));
		assert.ok(session);

		for (let day = 1; day < 30; day += 1) {
			moveClockTo(AT + day * A_DAY);
			assert.equal(
				(await post(url, '/session/refresh', { token: session.token })).status,
				200,
				`the daily reach on day ${day} was refused`
			);
		}

		moveClockTo(AT + 30 * A_DAY);

		const response = await post(url, '/session/refresh', { token: session.token });

		assert.equal(response.status, 401);

		const { error } = await answerOf(response);

		assert.ok(error);
		assert.equal(error.code, SESSION_LIFETIME_REACHED, 'the refusal reads as an expired window');
		assert.match(error.message, /sign in with google again/);
	});
});

// Expiry stops replication and takes nothing away. The refusal is the mint declining to hand out
// a fresh workspace token — no database is removed, no membership is dropped, and the account is
// still there to be signed back in to.
test('a sign-in past its month stops the mint and takes nothing away', async () => {
	await withControlPlane(googleVouchingFor(SOMEBODY), async ({ url, moveClockTo, turso }) => {
		const { account, session, workspace } = await answerOf(await post(url, '/account/sign-in'));

		assert.ok(account && session && workspace);

		moveClockTo(AT + 30 * A_DAY);

		const refused = await post(url, `/workspace/${workspace.id}/token`, {
			token: session.token,
			body: { schemaVersion: await targetSchemaVersion() }
		});

		assert.equal(refused.status, 401);
		assert.equal((await answerOf(refused)).error?.code, SESSION_LIFETIME_REACHED);
		assert.deepEqual(turso.deleted, [], 'a workspace database was removed to produce a refusal');

		// and signing in again is the whole of the way back: the same account, the same workspace.
		const back = await answerOf(await post(url, '/account/sign-in'));

		assert.equal(back.account?.id, account.id);
		assert.ok(back.session);

		const minted = await post(url, `/workspace/${workspace.id}/token`, {
			token: back.session.token,
			body: { schemaVersion: await targetSchemaVersion() }
		});

		assert.equal(minted.status, 200);
	});
});

// Revocation, as this repository can do it: per account, at the next reach, bounded by the
// window rather than by anything the vendor propagates.
test('declining to renew ends the session at the next reach', async () => {
	await withControlPlane(googleVouchingFor(SOMEBODY), async ({ url, db }) => {
		const { account, session } = await answerOf(await post(url, '/account/sign-in'));

		assert.ok(account && session);
		assert.equal((await post(url, '/session/refresh', { token: session.token })).status, 200);
		assert.equal(await declineRenewal(db, account.id), 1);

		const refused = await post(url, '/session/refresh', { token: session.token });

		assert.equal(refused.status, 401);
		assert.equal((await answerOf(refused)).error?.code, SESSION_EXPIRED);
	});
});

test('refreshing with no credential is unauthenticated rather than expired', async () => {
	await withControlPlane(googleVouchingFor(SOMEBODY), async ({ url }) => {
		const response = await post(url, '/session/refresh', { token: null });

		assert.equal(response.status, 401);
		assert.equal((await answerOf(response)).error?.code, UNAUTHENTICATED);
	});
});

// #4 of the review: `asking` renews on every route, so every route that acts as somebody has to
// say so. A route that renewed silently leaves the client holding a number three days stale, and
// the client stops replicating on a window that had already moved.
//
// **There are two such routes now**, sign-in-or-refresh and the mint, and this reaches both. It
// used to reach three; `POST /workspace` went with requirement 6, and there is no route left that
// acts as somebody and is not checked here.
test('every route that acts as somebody answers with the window it just moved', async () => {
	await withControlPlane(googleVouchingFor(SOMEBODY), async ({ url, moveClockTo }) => {
		const { session } = await answerOf(await post(url, '/account/sign-in'));
		assert.ok(session);

		const atCreate = AT + 1 * A_DAY;
		moveClockTo(atCreate);

		const resumed = await answerOf(await post(url, '/account/sign-in', { token: session.token }));

		assert.ok(resumed.workspace);
		assert.equal(
			resumed.session?.expiresAt,
			atCreate + 3 * A_DAY,
			'identifying renewed and said nothing'
		);

		const atMint = AT + 2 * A_DAY;
		moveClockTo(atMint);

		const minted = await answerOf(
			await post(url, `/workspace/${resumed.workspace.id}/token`, {
				token: session.token,
				body: { schemaVersion: await targetSchemaVersion() }
			})
		);

		assert.equal(minted.session?.expiresAt, atMint + 3 * A_DAY, 'minting renewed and said nothing');
	});
});

// #5 of the review: the session and the replica credential are started by different calls, so
// equal *lengths* prove nothing. The mint is the renewal a client holding a workspace uses
// precisely because it is the one call that restarts both — asserted here as one moment, not as
// two numbers that happen to be three days.
test('the mint restarts both windows together, and says so in one answer', async () => {
	await withControlPlane(googleVouchingFor(SOMEBODY), async ({ url, moveClockTo }) => {
		const { session, workspace } = await answerOf(await post(url, '/account/sign-in'));

		assert.ok(session && workspace);

		const atMint = AT + 2 * A_DAY;
		moveClockTo(atMint);

		const minted = await answerOf(
			await post(url, `/workspace/${workspace.id}/token`, {
				token: session.token,
				body: { schemaVersion: await targetSchemaVersion() }
			})
		);

		assert.equal(minted.expiresAt, atMint + 3 * A_DAY, 'the replica credential');
		assert.equal(minted.session?.expiresAt, atMint + 3 * A_DAY, 'the session');
		assert.equal(
			minted.expiresAt,
			minted.session?.expiresAt,
			'the mint left the two windows on different clocks'
		);
	});
});

// And the drift the fix exists for, demonstrated rather than described: refreshing moves one
// window and not the other. The control plane is right to allow it — a client with no workspace
// has nothing to mint — and it is why the desktop keeps both numbers and believes the earlier.
test('refreshing moves the session and leaves the replica credential where it was', async () => {
	await withControlPlane(googleVouchingFor(SOMEBODY), async ({ url, moveClockTo }) => {
		const { session, workspace } = await answerOf(await post(url, '/account/sign-in'));

		assert.ok(session && workspace);

		const minted = await answerOf(
			await post(url, `/workspace/${workspace.id}/token`, {
				token: session.token,
				body: { schemaVersion: await targetSchemaVersion() }
			})
		);

		moveClockTo(AT + 2 * A_DAY);

		const refreshed = await answerOf(await post(url, '/session/refresh', { token: session.token }));

		assert.equal(refreshed.session?.expiresAt, AT + 5 * A_DAY, 'the session did not move');
		assert.equal(minted.expiresAt, AT + 3 * A_DAY, 'and the replica credential still dies here');
	});
});
