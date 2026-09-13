import assert from 'node:assert/strict';
import test from 'node:test';

import { appRouter } from '$lib/api/router.ts';
import { caller, context } from '$lib/api/trpc.ts';
import { organization } from '$lib/organization/router.ts';
import { PASSWORD_FLOOR } from '$lib/organization/setup.ts';
import { createMemoryDatabase } from '$lib/platform/database/memory.ts';
import { fakeHost } from '$lib/platform/tests/testing.ts';
import { fakeIdentity } from '$lib/api/tests/testing.ts';
import { maskOf, type Administration } from '@rentable/workspace-permission';
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
			create: async (name, username, password) => {
				asked.push(`create:${name}:${username}:${password.length}`);

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

test('creating hands the trimmed name, the trimmed username and the password to the host as given', async () => {
	const asked: string[] = [];
	const api = await signedOutApi(hostRecording(asked));

	const created = await api.app.organization.create({
		name: '  Acme Rentals ',
		username: ' Olivia.Owner ',
		password: 'a long enough password'
	});

	assert.equal(created.joinLink, 'rentable://join/abc');
	assert.deepEqual(asked, ['create:Acme Rentals:Olivia.Owner:22']);
});

// the three bounds the walk states, refused here before a round trip. The username's are
// requirement 21's: three to thirty-two characters of letters, digits, `.`, `_` and `-`.
test('an empty name, a username outside the rules or a password under the floor is refused before the host is reached', async () => {
	const asked: string[] = [];
	const api = await signedOutApi(hostRecording(asked));
	const password = 'a long enough password';

	await assert.rejects(api.app.organization.create({ name: '   ', username: 'olivia', password }));
	await assert.rejects(
		api.app.organization.create({
			name: 'Acme',
			username: 'olivia',
			password: 'x'.repeat(PASSWORD_FLOOR - 1)
		})
	);

	for (const username of ['ol', 'o'.repeat(33), 'olivia owner', 'olivia@acme.example', '']) {
		await assert.rejects(
			api.app.organization.create({ name: 'Acme', username, password }),
			username
		);
	}

	assert.deepEqual(asked, []);
});

// requirement 22, from this side: no procedure lists organizations, because a group-scoped token
// cannot, and the organization is whichever holds the selected group. Members and invitations
// are listed, from the replica; organizations are not.
test('nothing here asks the host to list organizations', () => {
	const procedures = Object.keys(organization._def.procedures).sort();

	assert.deepEqual(procedures, [
		'consent.begin',
		'consent.disconnect',
		'consent.result',
		'create',
		'invitation.list',
		'invitation.reissue',
		'invitation.revoke',
		'member.invite',
		'member.list',
		'member.lockOutCost',
		'member.remove',
		'member.rename',
		'password.change',
		'workspace.create',
		'workspace.grant',
		'workspace.open',
		'workspace.remove',
		'workspace.renewCredentials'
	]);
	assert.ok(!procedures.some((name) => /organizations/i.test(name)));
});

/**
 * a caller whose row carries the acts named, the way `api/tests/procedure.test.ts` builds one:
 * the real context with an identity in it, and the host above recording what reached it.
 */
async function permittedApi(host: Host, ...acts: Administration[]) {
	const ctx = await context({
		db: createMemoryDatabase(),
		clock: { now: () => 0 },
		host,
		identity: fakeIdentity({ permissions: maskOf(...acts) })
	});

	return caller(appRouter)(ctx);
}

// requirement 23: a rename is held to requirement 21's rules before the host is reached, and what
// reaches the host is the trimmed username; a caller without `inviteMember` is refused before
// either. Whether the username is taken is Rust's alone.
test('a rename hands the trimmed username on, refuses one outside the rules first, and needs the inviting act', async () => {
	const asked: string[] = [];
	const host = fakeHost({
		organization: {
			...fakeHost().organization,
			member: {
				...fakeHost().organization.member,
				rename: async (memberId, username) => {
					asked.push(`rename:${memberId}:${username}`);

					return {
						id: memberId,
						username,
						role: 'member',
						permissions: 0,
						mustChangePassword: false,
						workspaceIds: [],
						createdAt: 0
					};
				}
			}
		}
	});
	const api = await permittedApi(host, 'inviteMember');

	const renamed = await api.app.organization.member.rename({
		memberId: 'member-2',
		username: ' Sami.Staff '
	});

	assert.equal(renamed.username, 'Sami.Staff');
	assert.deepEqual(asked, ['rename:member-2:Sami.Staff']);

	for (const username of ['sa', 's'.repeat(33), 'sami staff', 'sami@acme.example', '']) {
		await assert.rejects(
			api.app.organization.member.rename({ memberId: 'member-2', username }),
			username
		);
	}

	const without = await permittedApi(host);

	await assert.rejects(
		without.app.organization.member.rename({ memberId: 'member-2', username: 'sami' })
	);
	assert.deepEqual(asked, ['rename:member-2:Sami.Staff']);
});
