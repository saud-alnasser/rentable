import assert from 'node:assert/strict';
import test from 'node:test';

import { appRouter } from '$lib/api/router.ts';
import { caller, context } from '$lib/api/trpc.ts';
import { organization } from '$lib/organization/router.ts';
import { PASSWORD_FLOOR } from '$lib/organization/setup.ts';
import { createMemoryDatabase } from '$lib/platform/database/memory.ts';
import { fakeHost } from '$lib/platform/tests/testing.ts';
import type { Host } from '$lib/platform/host.ts';

/**
 * THE ORGANIZATION ROUTER
 *
 * Every procedure here is `public` and reaches `ctx.host` alone, because all of it happens before
 * there is anybody to act as. What is worth pinning is what the router refuses before the host is
 * reached, and that what it hands on is exactly what it was given: the host is the credential
 * boundary, and a router that reshaped a call on its way there would be the place that drift
 * hides.
 */

/**
 * a caller with nobody signed in, which is what every first run is: the real context with no
 * identity in it, as `api/tests/procedure.test.ts` builds one.
 */
async function signedOutApi(host: Host) {
	const ctx = await context({
		db: createMemoryDatabase(),
		clock: { now: () => 0 },
		host,
		identity: null
	});

	return caller(appRouter)(ctx);
}

/** a host that records what it was asked, and answers with fixed outcomes. */
function hostRecording(asked: string[]): Host {
	return fakeHost({
		organization: {
			...fakeHost().organization,
			consentBegin: async () => {
				asked.push('consentBegin');

				return { sessionId: 'consent-1', authorizationUrl: 'https://app.turso.tech/oauth' };
			},
			consentResult: async (sessionId) => {
				asked.push(`consentResult:${sessionId}`);

				return { sessionId, status: 'granted', error: null };
			},
			disconnect: async () => {
				asked.push('disconnect');
			},
			create: async (name, password) => {
				asked.push(`create:${name}:${password.length}`);

				return { organizationId: 'org-1', joinLink: 'rentable://join/abc', synced: true };
			}
		}
	});
}

test('the consent is opened, polled and given up through the host, and nobody has to be signed in', async () => {
	const asked: string[] = [];
	const api = await signedOutApi(hostRecording(asked));

	const started = await api.app.organization.consent.begin();
	const result = await api.app.organization.consent.result({ sessionId: started.sessionId });
	await api.app.organization.consent.disconnect();

	assert.equal(started.authorizationUrl, 'https://app.turso.tech/oauth');
	assert.equal(result.status, 'granted');
	assert.deepEqual(asked, ['consentBegin', 'consentResult:consent-1', 'disconnect']);
});

test('creating hands the trimmed name and the password to the host as given', async () => {
	const asked: string[] = [];
	const api = await signedOutApi(hostRecording(asked));

	const created = await api.app.organization.create({
		name: '  Acme Rentals ',
		password: 'a long enough password'
	});

	assert.equal(created.joinLink, 'rentable://join/abc');
	assert.deepEqual(asked, ['create:Acme Rentals:22']);
});

// the two bounds the walk states, refused here before a round trip.
test('an empty name or a password under the floor is refused before the host is reached', async () => {
	const asked: string[] = [];
	const api = await signedOutApi(hostRecording(asked));

	await assert.rejects(
		api.app.organization.create({ name: '   ', password: 'a long enough password' })
	);
	await assert.rejects(
		api.app.organization.create({ name: 'Acme', password: 'x'.repeat(PASSWORD_FLOOR - 1) })
	);

	assert.deepEqual(asked, []);
});

// requirement 22, from this side: no procedure lists organizations, because a group-scoped token
// cannot, and the organization is whichever holds the selected group.
test('nothing here asks the host to list organizations', () => {
	const procedures = Object.keys(organization._def.procedures).sort();

	assert.deepEqual(procedures, [
		'consent.begin',
		'consent.disconnect',
		'consent.result',
		'create',
		'workspace.create',
		'workspace.grant',
		'workspace.open',
		'workspace.remove',
		'workspace.renewCredentials'
	]);
	assert.ok(!procedures.some((name) => /list|organizations/i.test(name)));
});
