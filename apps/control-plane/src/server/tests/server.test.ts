import assert from 'node:assert/strict';
import test from 'node:test';

import type { Database } from '../../database/database.ts';
import type { VerifyGoogleIdentity } from '../../account/google.ts';

import { MALFORMED, NOT_VERIFIED, Refusal, UNAUTHENTICATED } from '../../failure.ts';
import {
	freshDatabase,
	googleVouchingFor,
	runningControlPlane,
	SOMEBODY,
	tursoInMemory
} from '../../tests/testing.ts';

const AT = Date.UTC(2026, 7, 18, 12, 0, 0);

/**
 * What a route answers with, whichever half of it. `fetch` types a decoded body as `unknown` and
 * every assertion below reaches into it, so the shape is named once here rather than cast at
 * each of a dozen call sites.
 */
type Answer = {
	account?: {
		id: string;
		email: string;
		displayName: string;
		avatarUrl: string | null;
		googleUserId: string;
		createdAt: number;
		updatedAt: number;
	};
	workspace?: {
		id: string;
		name: string;
		ownerAccountId: string;
		createdAt: number;
		updatedAt: number;
	};
	token?: string;
	url?: string;
	expiresAt?: number;
	error?: { code: string; message: string };
	status?: string;
};

const answerOf = async (response: Response): Promise<Answer> => (await response.json()) as Answer;

const withControlPlane = async (
	verifyIdentity: VerifyGoogleIdentity,
	run: (reached: {
		url: string;
		db: Database;
		turso: ReturnType<typeof tursoInMemory>;
	}) => Promise<void>,
	turso: ReturnType<typeof tursoInMemory> = tursoInMemory()
) => {
	const { db, close: closeDatabase } = await freshDatabase();
	const { url, close } = await runningControlPlane({
		db,
		verifyIdentity,
		platform: turso.platform,
		now: () => AT
	});

	try {
		await run({ url, db, turso });
	} finally {
		await close();
		await closeDatabase();
	}
};

const post = (
	url: string,
	path: string,
	{ token = 'a-token', body }: { token?: string | null; body?: unknown } = {}
) =>
	fetch(`${url}${path}`, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			...(token === null ? {} : { authorization: `Bearer ${token}` })
		},
		body: typeof body === 'string' ? body : body === undefined ? undefined : JSON.stringify(body)
	});

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

// Acceptance criterion 1: a database on Turso, and a record naming it, owned by whoever asked.
test('creating a workspace provisions a database and a record that names it', async () => {
	await withControlPlane(googleVouchingFor(SOMEBODY), async ({ url, turso }) => {
		const { account } = await answerOf(await post(url, '/account/sign-in'));
		const response = await post(url, '/workspace', { body: { name: 'Riyadh' } });

		assert.equal(response.status, 201);

		const { workspace } = await answerOf(response);

		assert.ok(workspace && account);
		assert.equal(workspace.name, 'Riyadh');
		assert.equal(workspace.ownerAccountId, account.id, 'it belongs to somebody else');
		assert.deepEqual([...turso.databases], [`ws-${workspace.id}`], 'no database was provisioned');
	});
});

test('a workspace needs a name', async () => {
	await withControlPlane(googleVouchingFor(SOMEBODY), async ({ url }) => {
		const response = await post(url, '/workspace', { body: { name: '  ' } });

		assert.equal(response.status, 400);
		assert.equal((await answerOf(response)).error?.code, MALFORMED);
	});
});

test('a body that is not json says so', async () => {
	await withControlPlane(googleVouchingFor(SOMEBODY), async ({ url }) => {
		const response = await post(url, '/workspace', { body: 'not json at all' });

		assert.equal(response.status, 400);
		assert.equal((await answerOf(response)).error?.code, MALFORMED);
	});
});

// Acceptance criterion 2: scoped to one database, and short-lived.
test('the mint issues a token for that one database, with a lifetime', async () => {
	await withControlPlane(googleVouchingFor(SOMEBODY), async ({ url, turso }) => {
		await post(url, '/account/sign-in');
		const { workspace } = await answerOf(
			await post(url, '/workspace', { body: { name: 'Riyadh' } })
		);

		assert.ok(workspace);

		const response = await post(url, `/workspace/${workspace.id}/token`);

		assert.equal(response.status, 200);

		const minted = await answerOf(response);

		assert.ok(minted.token);
		assert.equal(minted.url, `libsql://ws-${workspace.id}-org.aws-eu-west-1.turso.io`);
		assert.equal(minted.expiresAt, AT + 3 * 24 * 60 * 60 * 1000);
		assert.deepEqual(turso.minted, [{ database: `ws-${workspace.id}`, expiration: '3d' }]);
	});
});
