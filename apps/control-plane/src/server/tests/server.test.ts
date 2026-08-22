import assert from 'node:assert/strict';
import test from 'node:test';

import Fastify from 'fastify';

import { and, eq } from 'drizzle-orm';

import type { Database } from '../../database/database.ts';
import type { VerifyGoogleIdentity } from '../../account/google.ts';

import {
	CLIENT_OUT_OF_DATE,
	MALFORMED,
	NO_SUCH_WORKSPACE,
	NOT_A_MEMBER,
	NOT_PERMITTED,
	NOT_VERIFIED,
	Refusal,
	SESSION_EXPIRED,
	SESSION_LIFETIME_REACHED,
	UNAUTHENTICATED
} from '../../failure.ts';
import {
	membership as membershipTable,
	workspace as workspaceTable
} from '../../database/schema.ts';
import { declineRenewal } from '../../session/session.ts';
import { targetSchemaVersion } from '../../workspace/migration.ts';
import { identifySchema, WIRE_FIELDS } from '../schema.ts';
import {
	ADMINISTRATION_BY_ROLE,
	EVERY_ADMINISTRATION,
	maskOf,
	permits
} from '@rentable/workspace-permission';
import {
	answerOf,
	freshDatabase,
	googleVouchingFor,
	logLines,
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

/**
 * RENAMING A WORKSPACE, OVER THE WIRE
 *
 * The first write this control plane accepts against a workspace row. Everything below drives the
 * real route against a real database, and the membership rows are built through the routes where
 * they can be and inserted where they cannot: there is no route that adds a member yet, which is
 * requirement 14's and out of scope here.
 */

const A_NEW_NAME = 'دار السلام';

// A second identity, the way `workspace.test.ts` declares one: everything of `SOMEBODY` except
// what tells two people apart. `google-subject-2` and `-3` are that file's, so this is the next.
const SOMEBODY_ELSE = {
	...SOMEBODY,
	subject: 'google-subject-4',
	email: 'noor@example.com',
	displayName: 'Noor Salim'
};

test('renaming a workspace answers with the new name', async () => {
	await withControlPlane(googleVouchingFor(SOMEBODY), async ({ url }) => {
		const owned = await aWorkspace(url);

		const response = await post(url, `/workspace/${owned.id}/name`, {
			body: { name: A_NEW_NAME }
		});

		assert.equal(response.status, 200);

		const answer = await answerOf(response);

		assert.equal(answer.workspace?.name, A_NEW_NAME);
		assert.equal(answer.workspace?.id, owned.id);
		// Every route renews the session it was reached with, and this one is no exception.
		assert.equal(answer.session?.expiresAt, AT + 3 * A_DAY);
	});
});

// And it stays renamed: `workspaceForAccount` answers with the existing workspace unchanged, so
// the display name it is handed at the next sign-in is not a name it corrects anything to.
test('and the next sign-in answers with the new name rather than the account display name', async () => {
	await withControlPlane(googleVouchingFor(SOMEBODY), async ({ url }) => {
		const owned = await aWorkspace(url);

		await post(url, `/workspace/${owned.id}/name`, { body: { name: A_NEW_NAME } });

		const { workspace } = await answerOf(await post(url, '/account/sign-in'));

		assert.equal(workspace?.name, A_NEW_NAME);
		assert.notEqual(workspace?.name, SOMEBODY.displayName);
	});
});

/**
 * **The permission is what refuses, and it says so.** A member of the workspace without
 * `renameWorkspace` is not the same as somebody who is not a member: the first keeps their replica
 * and the second gives it up, and a bare 403 for both would have the client choose between them by
 * guessing.
 */
test('a member without the flag is refused by a code that names the permission', async () => {
	await withControlPlane(googleVouchingFor(SOMEBODY), async ({ url, db }) => {
		const owned = await aWorkspace(url);
		const [ownership] = await db
			.select()
			.from(workspaceTable)
			.where(eq(workspaceTable.id, owned.id));

		// The owner's own row, stripped of everything it may administer. Nothing here adds a second
		// account, because there is no route that would: what is under test is the flag, and one
		// membership row set to zero is that test with nothing else moving.
		await db
			.update(membershipTable)
			.set({ permissions: ADMINISTRATION_BY_ROLE.member })
			.where(eq(membershipTable.accountId, ownership.ownerAccountId));

		const response = await post(url, `/workspace/${owned.id}/name`, {
			body: { name: 'not theirs to change' }
		});

		assert.equal(response.status, 403);

		const answer = await answerOf(response);

		assert.equal(answer.error?.code, NOT_PERMITTED);
		assert.notEqual(answer.error?.code, NOT_A_MEMBER, 'a permitted reader was told to give up');

		const { workspace } = await answerOf(await post(url, '/account/sign-in'));

		assert.equal(workspace?.name, owned.name, 'a refused rename went through anyway');
	});
});

// And granting it back is the whole of what changes the answer.
test('and the same account renames it once the flag is back', async () => {
	await withControlPlane(googleVouchingFor(SOMEBODY), async ({ url, db }) => {
		const owned = await aWorkspace(url);

		await db.update(membershipTable).set({ permissions: ADMINISTRATION_BY_ROLE.member });
		assert.equal(
			(await post(url, `/workspace/${owned.id}/name`, { body: { name: 'first try' } })).status,
			403
		);

		await db.update(membershipTable).set({ permissions: maskOf('renameWorkspace') });

		const response = await post(url, `/workspace/${owned.id}/name`, {
			body: { name: 'second try' }
		});

		assert.equal(response.status, 200);
		assert.equal((await answerOf(response)).workspace?.name, 'second try');
	});
});

/**
 * The three names this route will not store, each with its own reason.
 *
 * Empty and whitespace-only are one answer deliberately: after trimming they are the same name,
 * and telling somebody their four spaces were not four spaces says nothing they can use.
 */
test('a name it will not store is refused, and the refusal says which of the three it was', async () => {
	await withControlPlane(googleVouchingFor(SOMEBODY), async ({ url }) => {
		const owned = await aWorkspace(url);

		for (const [body, expected] of [
			[{}, /say what this workspace should be called/],
			[{ name: 7 }, /say what this workspace should be called/],
			[{ name: '' }, /a workspace needs a name/],
			[{ name: '   ' }, /a workspace needs a name/],
			[{ name: 'n'.repeat(121) }, /too long/]
		] as const) {
			const response = await post(url, `/workspace/${owned.id}/name`, { body });

			assert.equal(response.status, 400, JSON.stringify(body));

			const answer = await answerOf(response);

			assert.equal(answer.error?.code, MALFORMED, JSON.stringify(body));
			assert.match(answer.error?.message ?? '', expected);
		}

		// and nothing was stored by any of them.
		const { workspace } = await answerOf(await post(url, '/account/sign-in'));

		assert.equal(workspace?.name, owned.name);
	});
});

// The bound is the route's rather than the column's, so it is worth pinning where it actually sits.
test('a name at the limit is stored and one past it is not', async () => {
	await withControlPlane(googleVouchingFor(SOMEBODY), async ({ url }) => {
		const owned = await aWorkspace(url);
		const atTheLimit = 'n'.repeat(120);

		const accepted = await post(url, `/workspace/${owned.id}/name`, { body: { name: atTheLimit } });

		assert.equal(accepted.status, 200);
		assert.equal((await answerOf(accepted)).workspace?.name, atTheLimit);
	});
});

test('renaming a workspace this account is not a member of is refused', async () => {
	await withControlPlane(googleVouchingFor(SOMEBODY), async ({ url }) => {
		await aWorkspace(url);

		const response = await post(url, '/workspace/a-workspace-that-does-not-exist/name', {
			body: { name: 'nothing to rename' }
		});

		assert.equal(response.status, 404);
		assert.equal((await answerOf(response)).error?.code, NO_SUCH_WORKSPACE);
	});
});

test('and renaming one with no credential at all is unauthenticated', async () => {
	await withControlPlane(googleVouchingFor(SOMEBODY), async ({ url }) => {
		const owned = await aWorkspace(url);

		const response = await post(url, `/workspace/${owned.id}/name`, {
			token: null,
			body: { name: 'nobody is asking' }
		});

		assert.equal(response.status, 401);
		assert.equal((await answerOf(response)).error?.code, UNAUTHENTICATED);
	});
});

/**
 * WHAT AN IDENTIFYING ANSWER SAYS ABOUT THE ASKING ACCOUNT
 *
 * Requirement 1, over the wire. `membership.permissions` has existed since this control plane had
 * permissions and no answer has ever carried it, so a client that wanted to know whether to draw a
 * control had two ways to find out: draw it and read the refusal, or guess from the role.
 *
 * **The number is asserted rather than a role**, in every test below. What a surface may do is the
 * column, and `ADMINISTRATION_BY_ROLE` is only what a row is *created* with — a test that asserted
 * *the owner may rename* through a role would pass on a row whose column says otherwise, which is
 * the distinction requirement 8 has something riding on.
 */
test('an identifying answer says what the asking account may do in the workspace it named', async () => {
	await withControlPlane(googleVouchingFor(SOMEBODY), async ({ url }) => {
		const { workspace } = await answerOf(await post(url, '/account/sign-in'));

		assert.ok(workspace, 'signing in brought no workspace');
		assert.equal(workspace.permissions, ADMINISTRATION_BY_ROLE.owner);
		assert.ok(permits(workspace.permissions, 'renameWorkspace'), 'the owner may not rename it');
	});
});

// Two rows, one account, and the answer follows the column both times. A default read off the role
// would answer the same number twice.
test('and it is the number on the row rather than anything derived from a role', async () => {
	await withControlPlane(googleVouchingFor(SOMEBODY), async ({ url, db }) => {
		const owned = await aWorkspace(url);

		for (const granted of [maskOf('inviteMember', 'changeRole'), ADMINISTRATION_BY_ROLE.member]) {
			// The role is deliberately left alone: nothing below writes it, so what moves between
			// the two halves of this loop is the column and only the column.
			await db.update(membershipTable).set({ permissions: granted });

			const { workspace } = await answerOf(await post(url, '/account/sign-in'));

			assert.equal(workspace?.permissions, granted);
		}

		const [row] = await db
			.select()
			.from(membershipTable)
			.where(eq(membershipTable.workspaceId, owned.id));

		assert.equal(row.role, 'owner', 'the role moved, so the column is not what was measured');
	});
});

// Sign-in and refresh are one handler, which is what makes this a check that it stayed one rather
// than a second body of behaviour.
test('a refresh carries the permissions too, which is the same handler', async () => {
	await withControlPlane(googleVouchingFor(SOMEBODY), async ({ url, db }) => {
		const { session } = await answerOf(await post(url, '/account/sign-in'));

		assert.ok(session);
		await db.update(membershipTable).set({ permissions: maskOf('removeMember') });

		const refreshed = await answerOf(await post(url, '/session/refresh', { token: session.token }));

		assert.equal(refreshed.workspace?.permissions, maskOf('removeMember'));
	});
});

/**
 * The rename's answer carries it, from the row the authorization already read.
 *
 * **There is no second query behind this and that is the point of the shape.**
 * `workspaceThisAccountMay` reads the membership row to decide whether the rename is allowed and
 * now hands it back rather than dropping it, so the route says what it found instead of finding it
 * again.
 */
test('a rename answers with the permissions from the row it authorized against', async () => {
	await withControlPlane(googleVouchingFor(SOMEBODY), async ({ url, db }) => {
		const owned = await aWorkspace(url);

		await db
			.update(membershipTable)
			.set({ permissions: maskOf('renameWorkspace', 'inviteMember') })
			.where(eq(membershipTable.workspaceId, owned.id));

		const renamed = await answerOf(
			await post(url, `/workspace/${owned.id}/name`, { body: { name: A_NEW_NAME } })
		);

		assert.equal(renamed.workspace?.name, A_NEW_NAME);
		assert.equal(renamed.workspace?.permissions, maskOf('renameWorkspace', 'inviteMember'));

		// and the two routes agree about the same row, which is the coherence a client depends on
		// when it renames and then signs in again.
		const { workspace } = await answerOf(await post(url, '/account/sign-in'));

		assert.equal(workspace?.permissions, renamed.workspace?.permissions);
		assert.equal(workspace?.name, A_NEW_NAME, 'a rename did not survive the next sign-in');
	});
});

/**
 * A membership row that is not there answers zero and does not refuse.
 *
 * **Sign-in is not the place to lock somebody out.** The row is written inside `createWorkspace`'s
 * transaction, so the state below is one no route produces; what a refusal here would cost is the
 * whole application, over a row nothing is asserting is missing. Zero is the true answer — an
 * account with no membership administers nothing — and every surface reading it draws nothing
 * administrative, which is the outcome to want.
 */
test('an account with no membership row is answered with zero rather than refused', async () => {
	await withControlPlane(googleVouchingFor(SOMEBODY), async ({ url, db }) => {
		await aWorkspace(url);
		await db.delete(membershipTable);

		const response = await post(url, '/account/sign-in');

		assert.equal(response.status, 200, 'a missing membership row locked an account out');
		assert.equal((await answerOf(response)).workspace?.permissions, 0);
	});
});

/**
 * Criterion 1a: the answer names the asking account and nobody else.
 *
 * **Two membership rows on one workspace, which is a state no route here creates** — there is no
 * invite and no members listing, and this test writes the second row directly because that is the
 * only way to have one. It is worth the trouble: with a single row per workspace, *the asking
 * account's permissions* and *the workspace's permissions* are the same number, and a read scoped
 * by workspace alone would pass every other test in this file.
 *
 * The intruder holds everything and the owner holds one flag, so a read that answered with the
 * wrong row would answer with a bigger number rather than with nothing.
 */
test('the answer names the asking account and nobody else, on a workspace with two rows', async () => {
	// the token is what tells them apart, which is what `asking` hands the verifier.
	const googleVouchingByToken: VerifyGoogleIdentity = async (token) =>
		token === 'the-other-account' ? SOMEBODY_ELSE : SOMEBODY;

	await withControlPlane(googleVouchingByToken, async ({ url, db }) => {
		const owned = await aWorkspace(url);
		const { account: other } = await answerOf(
			await post(url, '/account/sign-in', { token: 'the-other-account' })
		);

		assert.ok(other && other.id !== owned.ownerAccountId, 'both tokens reached one account');

		await db.insert(membershipTable).values({
			workspaceId: owned.id,
			accountId: other.id,
			role: 'administrator',
			permissions: maskOf(...EVERY_ADMINISTRATION),
			createdAt: new Date(AT),
			updatedAt: new Date(AT)
		});

		await db
			.update(membershipTable)
			.set({ permissions: maskOf('inviteMember') })
			.where(
				and(
					eq(membershipTable.workspaceId, owned.id),
					eq(membershipTable.accountId, owned.ownerAccountId)
				)
			);

		const { workspace } = await answerOf(await post(url, '/account/sign-in'));

		assert.equal(workspace?.id, owned.id);
		assert.equal(workspace?.permissions, maskOf('inviteMember'));
		assert.notEqual(
			workspace?.permissions,
			maskOf(...EVERY_ADMINISTRATION),
			'the answer carried the other members row'
		);
	});
});

/**
 * Acceptance criterion 2a of `the-control-plane-declares-what-it-accepts`, and the only test in
 * this file that fails when the request pipeline is wired the obvious way.
 *
 * **A caller who has presented nothing is told that, and is not told which of their fields was
 * wrong.** That was the order before the surface became Fastify, because `asking` was called and
 * only then was the body read, and it survives because the authenticate hook is `onRequest`.
 *
 * **The second body is the one that discriminates, and it is why this is not one case but two.**
 * Fastify parses the body before `preValidation` runs and after `onRequest`, so:
 *
 * - a body that parses and has the wrong shape is refused by *validation*, which both hooks
 *   precede. It passes either way and proves nothing
 * - a body that is not JSON at all is refused by the *parser*, which only `onRequest` precedes.
 *   With `preValidation` this answers 400
 *
 * Measured on 2026-08-22 while building #742. Every other test in this file sends a valid
 * credential, so nothing else here goes red when the hook moves.
 */
test('no credential and a malformed body is unauthenticated, whichever kind of malformed', async () => {
	await withControlPlane(googleVouchingFor(SOMEBODY), async ({ url }) => {
		for (const path of ['/workspace/any-workspace/token', '/workspace/any-workspace/name']) {
			for (const body of [{ schemaVersion: 'four', name: 7 }, 'not json at all']) {
				const response = await post(url, path, { token: null, body });

				assert.equal(response.status, 401, `${path} with ${JSON.stringify(body)}`);
				assert.equal(
					(await answerOf(response)).error?.code,
					UNAUTHENTICATED,
					`${path} with ${JSON.stringify(body)}`
				);
			}
		}
	});
});

/**
 * The other half of the ordering, so that criterion 2a cannot be satisfied by refusing everything.
 *
 * A caller who *has* presented a credential and sent a bad body is told about the body, which is
 * what makes the test above a statement about order rather than about authentication winning.
 */
test('a credential and a malformed body is malformed, on both routes', async () => {
	await withControlPlane(googleVouchingFor(SOMEBODY), async ({ url }) => {
		const owned = await aWorkspace(url);

		for (const [path, body] of [
			[`/workspace/${owned.id}/token`, { schemaVersion: 'four' }],
			[`/workspace/${owned.id}/name`, { name: '' }]
		] as const) {
			const response = await post(url, path, { body });

			assert.equal(response.status, 400, path);
			assert.equal((await answerOf(response)).error?.code, MALFORMED, path);
		}
	});
});

/**
 * The one wire behaviour this change altered, pinned so that it is a decision rather than a
 * discovery.
 *
 * **A body sent without `content-type: application/json` used to be read anyway.** `readJsonBody`
 * consumed the stream and parsed it without ever looking at the header, so a caller who sent JSON
 * and mislabelled it was served. Fastify dispatches on the header, so a route that declares a body
 * gets no body at all and refuses on the shape.
 *
 * **It is 400 and not 415, which is worth pinning because the plan predicted 415.** Measured on
 * 2026-08-22: Fastify raises no media-type error here. The body is simply never parsed, the route
 * sees `undefined`, and the declaration refuses it like any other wrong shape. The two routes that
 * declare no body are unaffected and still answer 200, which is why this is two assertions rather
 * than one.
 *
 * Accepted by the human on 2026-08-22 as the single exception to *the wire contract does not
 * change*, on the evidence that the only client sets the header on every body it sends
 * (`apps/desktop/tauri/src/sync/control.rs:244` and `:332`).
 */
test('a body sent as the wrong media type is refused where it used to be read', async () => {
	await withControlPlane(googleVouchingFor(SOMEBODY), async ({ url }) => {
		const owned = await aWorkspace(url);

		const mislabelled = await fetch(`${url}/workspace/${owned.id}/name`, {
			method: 'POST',
			headers: { authorization: 'Bearer a-token', 'content-type': 'text/plain' },
			body: JSON.stringify({ name: 'a name that will not arrive' })
		});

		assert.equal(mislabelled.status, 400);
		assert.equal((await answerOf(mislabelled)).error?.code, MALFORMED);

		// and a route that declares no body is not touched by any of it.
		const identifying = await fetch(`${url}/account/sign-in`, {
			method: 'POST',
			headers: { authorization: 'Bearer a-token', 'content-type': 'text/plain' }
		});

		assert.equal(identifying.status, 200);

		// and nothing was renamed by the refused one.
		const { workspace } = await answerOf(await post(url, '/account/sign-in'));

		assert.equal(workspace?.name, owned.name);
	});
});

/**
 * Acceptance criterion 3 of `the-control-plane-declares-what-it-accepts`: the declaration is
 * enforced rather than documented.
 *
 * **It mounts the real declaration on a handler written to break it**, which is the only way to
 * ask this question. The routes themselves cannot answer it: `wire.ts` builds every body field by
 * field, so every route already returns exactly what is declared and would pass whether
 * serialization ran or not. What is under test is the declaration in `schema.ts` and the fact that
 * Fastify serializes through it, so the subject is the real `identifySchema` and a handler that
 * hands it something it does not name.
 *
 * `databaseName` is not chosen at random. It is a real column on the workspace record, it is the
 * one argument every administrative call to Turso takes, and a `wireWorkspace` that ever grew a
 * spread would carry it. This is the field the enforcement exists to stop.
 */
test('a field the declaration does not name cannot reach the wire', async () => {
	const app = Fastify({ logger: false });

	app.get('/identify', { schema: identifySchema }, async () => ({
		account: {
			id: 'a',
			email: 'e',
			displayName: 'd',
			avatarUrl: null,
			googleUserId: 'g',
			createdAt: 1,
			updatedAt: 2
		},
		workspace: {
			id: 'w',
			name: 'n',
			ownerAccountId: 'a',
			permissions: 3,
			createdAt: 1,
			updatedAt: 2,
			databaseName: 'ws-secret',
			databaseHostname: 'ws-secret-org.turso.io'
		},
		session: { token: 'rws_t', expiresAt: 1, absoluteExpiresAt: 2 },
		somethingElseEntirely: 'this was never declared'
	}));

	await app.listen({ port: 0, host: '127.0.0.1' });

	const address = app.server.address();

	assert.ok(address && typeof address === 'object');

	try {
		const body = (await (await fetch(`http://127.0.0.1:${address.port}/identify`)).json()) as {
			workspace: Record<string, unknown>;
			somethingElseEntirely?: unknown;
		};

		assert.equal(body.workspace.databaseName, undefined, 'the turso database name went out');
		assert.equal(body.workspace.databaseHostname, undefined, 'the turso hostname went out');
		assert.equal(body.somethingElseEntirely, undefined, 'an undeclared top-level field went out');

		// and what is declared is still there, so this is enforcement rather than an empty body.
		assert.equal(body.workspace.id, 'w');
		assert.equal(body.workspace.permissions, 3);
	} finally {
		await app.close();
	}
});

/**
 * The other half of criterion 3, and the one that guards the risk the spec actually names.
 *
 * **Enforced serialization drops silently.** A field removed from a declaration does not error,
 * does not warn, and does not appear: the client simply stops receiving something it used to.
 *
 * **The first version of this test could not have caught that**, and the way it failed is worth
 * recording. It compared the response against keys derived from the declarations, which
 * serialization guarantees will always match: delete a field from a declaration and both sides
 * shrink together. Measured on 2026-08-22 by deleting `ownerAccountId`, which this test passed and
 * two of the forty existing tests caught.
 *
 * So it compares against `WIRE_FIELDS`, which is written out by hand and is independent of the
 * schemas by construction. Changing what a route answers with now costs a deliberate edit there,
 * which is the right price for a contract with a client that does not regenerate.
 */
test('every wire field a route answers with is declared', async () => {
	await withControlPlane(googleVouchingFor(SOMEBODY), async ({ url }) => {
		const keys = (value: object | undefined) => Object.keys(value ?? {}).sort();
		const expected = (fields: readonly string[]) => [...fields].sort();

		const identifying = await answerOf(await post(url, '/account/sign-in'));

		assert.deepEqual(keys(identifying.account), expected(WIRE_FIELDS.account));
		assert.deepEqual(keys(identifying.workspace), expected(WIRE_FIELDS.workspace));
		assert.deepEqual(keys(identifying.session), expected(WIRE_FIELDS.session));

		const minted = await answerOf(
			await post(url, `/workspace/${identifying.workspace?.id}/token`, {
				body: { schemaVersion: await targetSchemaVersion() }
			})
		);

		assert.deepEqual(keys(minted), expected(WIRE_FIELDS.mint));
		assert.deepEqual(keys(minted.session), expected(WIRE_FIELDS.session));

		const renamed = await answerOf(
			await post(url, `/workspace/${identifying.workspace?.id}/name`, { body: { name: 'renamed' } })
		);

		assert.deepEqual(keys(renamed), expected(WIRE_FIELDS.rename));
		assert.deepEqual(keys(renamed.workspace), expected(WIRE_FIELDS.workspace));
	});
});

/**
 * Acceptance criterion 6: everything one request emits carries one identifier for that request.
 *
 * **The point is not that lines exist, it is that they can be told apart and joined back up.** Two
 * requests handled at the same moment used to interleave with nothing distinguishing them, and a
 * failure named no request at all: `console.error('control plane failed to answer', error)` in the
 * catch, and whoever read it had two failures and no way to say which caller met which.
 *
 * Read off the logger the server was given rather than off stdout, which is why
 * `controlPlaneServer` takes the option at all. The alternative, a logger it reached for, would be
 * the first ambient dependency in this package and could not be asserted on.
 */
test('two requests handled at once can be told apart, and a failure names its own', async () => {
	const sink = logLines();

	// Google explodes, so every request through this instance fails the same way. That is what
	// makes the second half of the criterion checkable: two failures at once, each with a line, and
	// the question is whether each line belongs to a request that can be named.
	const exploding = async () => {
		throw new Error('libsql: no such table: account_v2');
	};

	const { db, close: closeDatabase } = await freshDatabase();
	const hosted = await workspaceDatabases();
	const turso = tursoInMemory();
	const { url, close } = await runningControlPlane(
		{
			db,
			verifyIdentity: exploding,
			platform: turso.platform,
			connectToWorkspace: hosted.connect,
			now: () => AT
		},
		{ logger: { level: 'info', stream: sink.stream } }
	);

	try {
		const [first, second] = await Promise.all([
			post(url, '/account/sign-in'),
			post(url, '/account/sign-in')
		]);

		assert.equal(first.status, 500);
		assert.equal(second.status, 500);

		const lines = sink.lines();
		const requests = lines.filter((line) => line.msg === 'incoming request');
		const failures = lines.filter((line) => line.msg === 'control plane failed to answer');

		assert.equal(requests.length, 2, 'both requests should have been logged');
		assert.equal(failures.length, 2, 'both failures should have been logged');

		// The whole of the first half: two concurrent requests, two identifiers, not one.
		const identifiers = new Set(requests.map((line) => String(line.reqId)));

		assert.equal(identifiers.size, 2, 'the two requests share an identifier');

		// And the second half: every failure line belongs to a request that was logged, so a reader
		// holding a failure can find the request that caused it.
		for (const failure of failures) {
			assert.ok(
				identifiers.has(String(failure.reqId)),
				`a failure carried ${String(failure.reqId)}, which names no request`
			);
		}

		assert.equal(
			new Set(failures.map((line) => String(line.reqId))).size,
			2,
			'the two failures share an identifier, so neither can be tied to its own request'
		);

		// and the internal detail is in the log where it belongs, having been kept out of the answer
		// by the test above this one.
		assert.ok(
			JSON.stringify(failures).includes('account_v2'),
			'the failure was logged without saying what failed'
		);
	} finally {
		await close();
		await hosted.close();
		await closeDatabase();
	}
});
