import assert from 'node:assert/strict';
import test from 'node:test';

import { MALFORMED, NOT_VERIFIED, Refusal } from './failure.ts';
import { freshDatabase, googleVouchingFor, runningControlPlane, SOMEBODY } from './testing.mjs';

const AT = Date.UTC(2026, 7, 18, 12, 0, 0);

/**
 * @param {import('./google.ts').VerifyGoogleIdentity} verifyIdentity
 * @param {(reached: { url: string; db: import('./database.ts').Database }) => Promise<void>} run
 */
const withControlPlane = async (verifyIdentity, run) => {
	const { db, close: closeDatabase } = await freshDatabase();
	const { url, close } = await runningControlPlane({ db, verifyIdentity, now: () => AT });

	try {
		await run({ url, db });
	} finally {
		await close();
		closeDatabase();
	}
};

/**
 * What a route answers with, either half of it. `fetch` types a decoded body as `unknown` and
 * every assertion below reaches into it, so the shape is named once here rather than cast at
 * each of a dozen call sites.
 *
 * @typedef {object} Answer
 * @property {{ id: string, email: string, displayName: string, avatarUrl: string | null, googleUserId: string, createdAt: number, updatedAt: number }} [account]
 * @property {{ code: string, message: string }} [error]
 * @property {string} [status]
 */

/**
 * @param {Response} response
 * @returns {Promise<Answer>}
 */
const answerOf = async (response) => /** @type {Answer} */ (await response.json());

/**
 * @param {string} url
 * @param {unknown} body
 */
const signIn = (url, body) =>
	fetch(`${url}/account/sign-in`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: typeof body === 'string' ? body : JSON.stringify(body)
	});

test('signing in reaches an account', async () => {
	await withControlPlane(googleVouchingFor(SOMEBODY), async ({ url }) => {
		const response = await signIn(url, { accessToken: 'a-token' });

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
		const first = await answerOf(await signIn(url, { accessToken: 'a-token' }));
		const second = await answerOf(await signIn(url, { accessToken: 'another-token' }));

		assert.ok(first.account && second.account);
		assert.equal(second.account.id, first.account.id);
	});
});

// Acceptance criterion 3: refused, typed, and the message names the action.
test('a sign-in Google will not vouch for is refused with a code and an action', async () => {
	const refusing = async () => {
		throw new Refusal(NOT_VERIFIED, 401, 'google would not confirm this sign-in. sign in again');
	};

	await withControlPlane(refusing, async ({ url }) => {
		const response = await signIn(url, { accessToken: 'a-stale-token' });

		assert.equal(response.status, 401);

		const { error } = await answerOf(response);

		assert.ok(error, 'the refusal carried no error');
		assert.equal(error.code, NOT_VERIFIED);
		assert.match(error.message, /sign in again/);
	});
});

test('a sign-in with no token is a malformed request, not a refused identity', async () => {
	await withControlPlane(googleVouchingFor(SOMEBODY), async ({ url }) => {
		for (const body of [{}, { accessToken: '   ' }, { accessToken: 7 }]) {
			const response = await signIn(url, body);

			assert.equal(response.status, 400);
			assert.equal((await answerOf(response)).error?.code, MALFORMED);
		}
	});
});

test('a body that is not json says so', async () => {
	await withControlPlane(googleVouchingFor(SOMEBODY), async ({ url }) => {
		const response = await signIn(url, 'not json at all');

		assert.equal(response.status, 400);
		assert.equal((await answerOf(response)).error?.code, MALFORMED);
	});
});

// A defect here is this process's, and its text names tables and paths. What goes out says
// nothing about either.
test('an unexpected failure tells the caller nothing about this process', async () => {
	const exploding = async () => {
		throw new Error('libsql: no such table: account_v2');
	};

	await withControlPlane(exploding, async ({ url }) => {
		const response = await signIn(url, { accessToken: 'a-token' });

		assert.equal(response.status, 500);

		const body = await response.text();

		assert.equal(body.includes('account_v2'), false, 'the internal message went out');
		assert.equal(/** @type {Answer} */ (JSON.parse(body)).error?.code, 'unavailable');
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
