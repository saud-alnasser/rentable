import assert from 'node:assert/strict';
import test from 'node:test';

import type { VerifyGoogleIdentity } from '../google.ts';

import { GOOGLE_UNREACHABLE, INCOMPLETE, NOT_VERIFIED, Refusal } from '../failure.ts';
import { verifyAgainstGoogle } from '../google.ts';

const answering =
	(status: number, body?: unknown): typeof fetch =>
	async () =>
		new Response(body === undefined ? null : JSON.stringify(body), {
			status,
			headers: { 'content-type': 'application/json' }
		});

const PROFILE = {
	sub: '110248495921238986420',
	email: 'amal@example.com',
	name: 'Amal Nasser',
	picture: 'https://example.com/amal.png'
};

const refusalFrom = async (verify: VerifyGoogleIdentity, token = 'a-token'): Promise<Refusal> => {
	const error = await verify(token).then(
		() => null,
		(caught: unknown) => caught
	);

	assert.ok(error instanceof Refusal, `expected a refusal, got ${error}`);
	return error;
};

test('a token Google vouches for becomes an identity', async () => {
	const verify = verifyAgainstGoogle({ fetch: answering(200, PROFILE) });
	const identity = await verify('a-token');

	assert.deepEqual(identity, {
		subject: PROFILE.sub,
		email: PROFILE.email,
		displayName: PROFILE.name,
		avatarUrl: PROFILE.picture
	});
});

// The verification is against Google, not against the client: whatever the caller claims about
// itself never reaches the identity, and this is the check that the token is what was presented.
test('the token is presented to Google as a bearer credential', async () => {
	let seen: { url: unknown; headers: Record<string, string> } | undefined;

	const verify = verifyAgainstGoogle({
		endpoint: 'https://example.test/userinfo',
		fetch: async (url, init) => {
			seen = { url, headers: (init?.headers ?? {}) as Record<string, string> };
			return new Response(JSON.stringify(PROFILE), { status: 200 });
		}
	});

	await verify('the-access-token');

	assert.ok(seen, 'google was never asked');
	assert.equal(seen.url, 'https://example.test/userinfo');
	assert.equal(seen.headers.authorization, 'Bearer the-access-token');
});

test('a token Google refuses is refused here, naming what to do', async () => {
	for (const status of [401, 403]) {
		const refusal = await refusalFrom(verifyAgainstGoogle({ fetch: answering(status, {}) }));

		assert.equal(refusal.code, NOT_VERIFIED);
		assert.equal(refusal.status, 401);
		assert.match(refusal.message, /sign in with google again/);
	}
});

// A control plane that could not ask is not the same failure as Google having answered no, and a
// client that cannot tell them apart either signs somebody out or retries forever.
test('a Google that cannot be reached is its own refusal', async () => {
	const refusal = await refusalFrom(
		verifyAgainstGoogle({
			fetch: async () => {
				throw new TypeError('fetch failed');
			}
		})
	);

	assert.equal(refusal.code, GOOGLE_UNREACHABLE);
	assert.equal(refusal.status, 503);
	assert.match(refusal.message, /try again/);
});

test('a Google that answers with a server error is not read as a refused sign-in', async () => {
	const refusal = await refusalFrom(verifyAgainstGoogle({ fetch: answering(500, {}) }));

	assert.equal(refusal.code, GOOGLE_UNREACHABLE);
});

// Criterion 2 rules out matching on the email address, so an answer without a subject has to
// fail rather than fall back to one.
test('an answer with no subject is refused rather than matched on the email', async () => {
	const refusal = await refusalFrom(
		verifyAgainstGoogle({ fetch: answering(200, { email: 'amal@example.com' }) })
	);

	assert.equal(refusal.code, INCOMPLETE);
	assert.equal(refusal.status, 502);
});

test('an answer with no email is refused too', async () => {
	const refusal = await refusalFrom(verifyAgainstGoogle({ fetch: answering(200, { sub: 'x' }) }));

	assert.equal(refusal.code, INCOMPLETE);
});

test('somebody who has set no name is known by their email', async () => {
	const verify = verifyAgainstGoogle({
		fetch: answering(200, { sub: 'x', email: 'amal@example.com', name: '   ' })
	});

	const identity = await verify('a-token');

	assert.equal(identity.displayName, 'amal@example.com');
	assert.equal(identity.avatarUrl, null);
});
