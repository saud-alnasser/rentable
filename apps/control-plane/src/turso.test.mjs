import assert from 'node:assert/strict';
import test from 'node:test';

import { Refusal, WORKSPACE_UNAVAILABLE } from './failure.ts';
import { tursoPlatform } from './turso.ts';

/**
 * The real Platform API client against a Turso that answers in a fake `fetch`.
 *
 * What this covers is the half a faithful in-memory stand-in cannot: the URL, the credential,
 * the query parameters, and the shape read back out. Those are exactly what a live account would
 * disagree with, and they are checked here against the published API and against the decision 11
 * prototype, which made the same create call for real.
 */

/**
 * @param {(url: string, init: RequestInit | undefined) => { status?: number; body?: unknown }} answer
 */
const platformAnswering = (answer) => {
	/** @type {{ url: string; init: RequestInit | undefined }[]} */
	const calls = [];

	const platform = tursoPlatform({
		apiToken: 'a-platform-token',
		organization: 'an-org',
		group: 'rentable',
		baseUrl: 'https://turso.test',
		fetch: /** @type {typeof fetch} */ (
			async (/** @type {string} */ url, /** @type {RequestInit} */ init) => {
				calls.push({ url, init });
				const { status = 200, body = {} } = answer(url, init);
				return new Response(JSON.stringify(body), { status });
			}
		)
	});

	return { platform, calls };
};

/** @param {() => Promise<unknown>} act */
const refusalFrom = async (act) => {
	const error = await act().then(
		() => null,
		(/** @type {unknown} */ caught) => caught
	);

	assert.ok(error instanceof Refusal, `expected a refusal, got ${error}`);
	return error;
};

test('creating a database names it, groups it, and reads the hostname back', async () => {
	const { platform, calls } = platformAnswering(() => ({
		body: { database: { DbId: 'an-id', Hostname: 'ws-1-an-org.turso.io', Name: 'ws-1' } }
	}));

	const created = await platform.createDatabase('ws-1');

	assert.deepEqual(created, { name: 'ws-1', hostname: 'ws-1-an-org.turso.io' });
	assert.equal(calls[0]?.url, 'https://turso.test/v1/organizations/an-org/databases');
	assert.equal(calls[0]?.init?.method, 'POST');
	assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), { name: 'ws-1', group: 'rentable' });
	const headers = /** @type {Record<string, string>} */ (calls[0]?.init?.headers ?? {});

	assert.equal(headers.authorization, 'Bearer a-platform-token');
});

// The documented spelling is `Hostname`, a Go struct field showing through. A change to it would
// be a silent total failure of the one route this service exists for, so both are read.
test('either spelling of the hostname is read', async () => {
	const { platform } = platformAnswering(() => ({
		body: { database: { hostname: 'ws-2-an-org.turso.io' } }
	}));

	assert.equal((await platform.createDatabase('ws-2')).hostname, 'ws-2-an-org.turso.io');
});

test('minting asks for one database, full access, and the lifetime it was given', async () => {
	const { platform, calls } = platformAnswering(() => ({ body: { jwt: 'a-database-token' } }));

	assert.equal(await platform.mintToken('ws-1', '3d'), 'a-database-token');

	const url = new URL(String(calls[0]?.url));

	assert.equal(url.pathname, '/v1/organizations/an-org/databases/ws-1/auth/tokens');
	assert.equal(url.searchParams.get('expiration'), '3d');
	assert.equal(url.searchParams.get('authorization'), 'full-access');
});

test('deleting a database names it in the path and uses DELETE', async () => {
	const { platform, calls } = platformAnswering(() => ({ body: { database: 'ws-1' } }));

	await platform.deleteDatabase('ws-1');

	assert.equal(calls[0]?.url, 'https://turso.test/v1/organizations/an-org/databases/ws-1');
	assert.equal(calls[0]?.init?.method, 'DELETE');
});

// Turso's own message names a database and sometimes an organization. The caller is asking about
// a workspace, not about the infrastructure under it.
test('a Turso that refuses on purpose does not tell anybody to try again', async () => {
	const { platform } = platformAnswering(() => ({
		status: 409,
		body: { error: 'database ws-1 already exists in organization an-org' }
	}));

	const refusal = await refusalFrom(() => platform.createDatabase('ws-1'));

	assert.equal(refusal.code, WORKSPACE_UNAVAILABLE);
	assert.equal(refusal.status, 502);
	assert.equal(refusal.message.includes('an-org'), false, 'the organization went out');
	assert.match(refusal.message, /will not help/);
});

// The one measured against a live account: a group with delete protection refuses to delete a
// database inside it, even though the database itself is not protected.
test('a delete Turso refuses is a refusal, not a moment that will pass', async () => {
	const { platform } = platformAnswering(() => ({
		status: 403,
		body: { error: 'group rentable is delete-protected and cannot be deleted' }
	}));

	const refusal = await refusalFrom(() => platform.deleteDatabase('ws-1'));

	assert.equal(refusal.status, 502);
	assert.equal(refusal.message.includes('rentable'), false, 'the group name went out');
});

test('a Turso having a bad minute is a moment that will pass', async () => {
	const { platform } = platformAnswering(() => ({ status: 502, body: {} }));

	const refusal = await refusalFrom(() => platform.createDatabase('ws-1'));

	assert.equal(refusal.status, 503);
	assert.match(refusal.message, /try again/);
});

test('an answer with no hostname is a failure rather than a workspace with no database', async () => {
	const { platform } = platformAnswering(() => ({ body: { database: {} } }));

	assert.equal(
		(await refusalFrom(() => platform.createDatabase('ws-1'))).code,
		WORKSPACE_UNAVAILABLE
	);
});

test('an answer with no jwt is a failure rather than an empty token', async () => {
	const { platform } = platformAnswering(() => ({ body: {} }));

	assert.equal(
		(await refusalFrom(() => platform.mintToken('ws-1', '3d'))).code,
		WORKSPACE_UNAVAILABLE
	);
});
