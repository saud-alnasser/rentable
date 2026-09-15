import assert from 'node:assert/strict';
import test from 'node:test';

import { appRouter } from '$lib/api/router.ts';
import { caller, context } from '$lib/api/trpc.ts';
import { organization } from '$lib/organization/router.ts';
import { PASSWORD_FLOOR } from '$lib/organization/setup.ts';
import { createMemoryDatabase } from '$lib/platform/database/memory.ts';
import {
	fakeHeldOrganization,
	fakeHost,
	fakeOrganizationState
} from '$lib/platform/tests/testing.ts';
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
			consentDisconnect: async () => {
				asked.push('consentDisconnect');
			},
			disconnect: async () => {
				asked.push('disconnect');

				return fakeOrganizationState({ organization: null, session: null });
			},
			create: async (name, username, password, group) => {
				asked.push(`create:${name}:${username}:${password.length}:${group}`);

				return { organizationId: 'org-1', synced: true };
			},
			groupInspect: async () => {
				asked.push('groupInspect');

				return { kind: 'held', organizationId: '7f3a' };
			},
			connectExisting: async (username, password) => {
				asked.push(`connectExisting:${username}:${password.length}`);

				return fakeOrganizationState({
					organization: fakeHeldOrganization({ memberId: 'member-owner', role: 'owner' })
				});
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
	assert.deepEqual(asked, ['consentBegin', 'consentResult:consent-1', 'consentDisconnect']);
});

// effort 824, requirement 20: forgetting the organization happens at the wall, so it is public and
// hands back the state the machine is left in. *A `connect` stood beside it, taking the
// organization's own link, until effort 828's requirement 16 retired that link; the two acts that
// take a link now each take its code with it and are `invitation.accept` and `machine.connect`.*
test('disconnecting reaches the host signed out, and answers with the state', async () => {
	const asked: string[] = [];
	const api = await signedOutApi(hostRecording(asked));

	const forgotten = await api.app.organization.disconnect();

	assert.deepEqual(asked, ['disconnect']);
	assert.equal(forgotten.organization, null);
});

// effort 826's second correction to requirement 13: the group is optional, and **both shapes are
// pinned** because the ordinary run is the one without it. Where it is given it is trimmed the
// way the name and the username are, since a name pasted out of Turso's own screen arrives with
// whatever whitespace came with it; where it is not, the host is handed `null`.
test('creating hands the trimmed name, the trimmed username and the password to the host as given, with the group where there is one', async () => {
	const asked: string[] = [];
	const api = await signedOutApi(hostRecording(asked));

	const created = await api.app.organization.create({
		name: '  Acme Rentals ',
		username: ' Olivia.Owner ',
		password: 'a long enough password'
	});

	assert.equal(created.organizationId, 'org-1');

	await api.app.organization.create({
		name: '  Acme Rentals ',
		username: ' Olivia.Owner ',
		password: 'a long enough password',
		group: ' rentable-empty '
	});

	assert.deepEqual(asked, [
		'create:Acme Rentals:Olivia.Owner:22:null',
		'create:Acme Rentals:Olivia.Owner:22:rentable-empty'
	]);
});

// the three bounds the walk states, refused here before a round trip. The username's are
// requirement 21's: three to thirty-two characters of letters, digits, `.`, `_` and `-`. The
// group has none while it is absent, and while it is present its only bound is that it says
// something, since what a group may be called is Turso's to say.
test('an empty name, a username outside the rules, a password under the floor or a group given as blank is refused before the host is reached', async () => {
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
	await assert.rejects(
		api.app.organization.create({ name: 'Acme', username: 'olivia', password, group: '   ' })
	);

	for (const username of ['ol', 'o'.repeat(33), 'olivia owner', 'olivia@acme.example', '']) {
		await assert.rejects(
			api.app.organization.create({ name: 'Acme', username, password }),
			username
		);
	}

	assert.deepEqual(asked, []);
});

// effort 826, requirements 6 and 7: a change of role and a withdrawal each reach the host behind
// their own act, and a caller whose row carries neither is refused before the round trip. What is
// refused on the row itself, the caller's own and the owner's, is Rust's.
test('changing a role and withdrawing a grant each need their act, and hand their input on', async () => {
	const asked: string[] = [];
	const host = fakeHost({
		organization: {
			...fakeHost().organization,
			member: {
				...fakeHost().organization.member,
				changeRole: async (memberId, role, permissions) => {
					asked.push(`changeRole:${memberId}:${role}:${permissions}`);

					return {
						id: memberId,
						username: 'sami.staff',
						role,
						permissions,
						workspaces: [],
						pending: null,
						createdAt: 0
					};
				}
			},
			workspace: {
				...fakeHost().organization.workspace,
				withdraw: async (workspaceId, memberId) => {
					asked.push(`withdraw:${workspaceId}:${memberId}`);
				}
			}
		}
	});

	const changing = await permittedApi(host, 'changeRole');
	const changed = await changing.app.organization.member.changeRole({
		memberId: 'member-2',
		role: 'member',
		permissions: 8
	});

	assert.equal(changed.permissions, 8);

	const granting = await permittedApi(host, 'grantWorkspace');

	await granting.app.organization.workspace.withdraw({
		workspaceId: 'workspace-1',
		memberId: 'member-2'
	});

	assert.deepEqual(asked, ['changeRole:member-2:member:8', 'withdraw:workspace-1:member-2']);

	// and neither act stands in for the other.
	await assert.rejects(
		granting.app.organization.member.changeRole({
			memberId: 'member-2',
			role: 'member',
			permissions: 8
		})
	);
	await assert.rejects(
		changing.app.organization.workspace.withdraw({
			workspaceId: 'workspace-1',
			memberId: 'member-2'
		})
	);
	assert.deepEqual(asked, ['changeRole:member-2:member:8', 'withdraw:workspace-1:member-2']);
});

// requirement 22, from this side: no procedure lists organizations, because a group-scoped token
// cannot, and the organization is whichever holds the selected group. Members and invitations
// are listed, from the replica; organizations are not.
test('nothing here asks the host to list organizations', () => {
	const procedures = Object.keys(organization._def.procedures).sort();

	assert.deepEqual(procedures, [
		'connectExisting',
		'consent.begin',
		'consent.disconnect',
		'consent.result',
		'create',
		'disconnect',
		'groupInspect',
		'invitation.accept',
		'invitation.link',
		'invitation.revoke',
		'machine.connect',
		'machine.link',
		'member.changeRole',
		'member.endSessions',
		'member.invite',
		'member.list',
		'member.lockOutCost',
		'member.remove',
		'member.rename',
		'member.reset',
		'password.change',
		'session.endElsewhere',
		'workspace.create',
		'workspace.grant',
		'workspace.open',
		'workspace.remove',
		'workspace.renewCredentials',
		'workspace.withdraw'
	]);
	assert.ok(!procedures.some((name) => /organizations/i.test(name)));
});

// effort 826, requirements 8 and 23: opening an invitation link happens at the wall, so it is
// public, hands the trimmed link, the code and the password on as given, and refuses a password
// under the floor and a code that is not six characters before the host is reached. Whether the
// invitation stands, and whether the link's secret and the code together open anything, are Rust's.
test('opening an invitation link reaches the host signed out, and a short password or a code that is not six is refused first', async () => {
	const asked: string[] = [];
	const host = fakeHost({
		organization: {
			...fakeHost().organization,
			invitation: {
				...fakeHost().organization.invitation,
				accept: async (link, code, password) => {
					asked.push(`accept:${link}:${code}:${password.length}`);

					return fakeOrganizationState({
						organization: fakeHeldOrganization({ memberId: 'member-2', role: 'member' })
					});
				}
			}
		}
	});
	const api = await signedOutApi(host);

	const admitted = await api.app.organization.invitation.accept({
		link: ' rentable://join/abc ',
		code: '7K4M9Q',
		password: 'a password sami chose'
	});

	assert.equal(admitted.organization?.memberId, 'member-2');
	assert.deepEqual(asked, ['accept:rentable://join/abc:7K4M9Q:21']);

	await assert.rejects(
		api.app.organization.invitation.accept({
			link: 'rentable://join/abc',
			code: '7K4M9Q',
			password: 'x'.repeat(PASSWORD_FLOOR - 1)
		})
	);
	await assert.rejects(
		api.app.organization.invitation.accept({
			link: '  ',
			code: '7K4M9Q',
			password: 'a password sami chose'
		})
	);

	for (const code of ['', '7K4M9', '7K4M9QQ']) {
		await assert.rejects(
			api.app.organization.invitation.accept({
				link: 'rentable://join/abc',
				code,
				password: 'a password sami chose'
			})
		);
	}

	assert.deepEqual(asked, ['accept:rentable://join/abc:7K4M9Q:21']);
});

// effort 828, requirement 1 from this side: copying an invitation hands back the link and the code
// together, under the act that makes invitations, and whether the caller is the one who issued this
// one is Rust's, because it turns on whose key the row's sealed secret opens for. *There was a
// second procedure for a fresh code until a code began living as long as its link.*
test('copying an invitation answers the link and the code, held to inviteMember', async () => {
	const asked: string[] = [];
	const host = fakeHost({
		organization: {
			...fakeHost().organization,
			invitation: {
				...fakeHost().organization.invitation,
				link: async (invitationId) => {
					asked.push(`link:${invitationId}`);

					return { joinLink: 'rentable://join/abc', code: '7K4M9Q' };
				}
			}
		}
	});
	const inviting = await permittedApi(host, 'inviteMember');
	const copy = await inviting.app.organization.invitation.link({ invitationId: ' inv-1 ' });

	assert.equal(copy.code, '7K4M9Q');
	assert.equal(copy.joinLink, 'rentable://join/abc');
	assert.deepEqual(asked, ['link:inv-1']);

	const resetting = await permittedApi(host, 'resetPassword');

	await assert.rejects(resetting.app.organization.invitation.link({ invitationId: 'inv-1' }));
	assert.deepEqual(asked, ['link:inv-1']);
});

// effort 828, requirement 3 from this side: making the pair for your own next machine needs a
// session and nothing else, because it acts on the caller's own account and mints nothing; opening
// one happens on a machine where nobody has signed in yet, so it is public. The code is six
// characters here as it is on an invitation, and everything else about the link is Rust's.
test('making a machine link needs a session, and connecting with one reaches the host signed out', async () => {
	const asked: string[] = [];
	const host = fakeHost({
		organization: {
			...fakeHost().organization,
			machineLinkMake: async () => {
				asked.push('machineLinkMake');

				return { link: 'rentable://join/abc', code: '7K4M9Q', expiresAt: 1_757_604_800_000 };
			},
			machineConnect: async (link, code) => {
				asked.push(`machineConnect:${link}:${code}`);

				return fakeOrganizationState({
					organization: fakeHeldOrganization({ memberId: null, role: null }),
					session: null
				});
			}
		}
	});
	const signedOut = await signedOutApi(host);

	await assert.rejects(
		signedOut.app.organization.machine.link(),
		'a machine link was made for nobody'
	);
	assert.deepEqual(asked, []);

	// any member, with no act of their own: it is their account and nobody else's row.
	const member = await permittedApi(host);
	const made = await member.app.organization.machine.link();

	assert.equal(made.code, '7K4M9Q');
	assert.equal(made.link, 'rentable://join/abc');
	assert.deepEqual(asked, ['machineLinkMake']);

	const connected = await signedOut.app.organization.machine.connect({
		link: ' rentable://join/abc ',
		code: '7K4M9Q'
	});

	assert.equal(connected.organization?.memberId, null, 'a connect recorded a member');
	assert.equal(connected.session, null, 'a connect opened a vault');
	assert.deepEqual(asked, ['machineLinkMake', 'machineConnect:rentable://join/abc:7K4M9Q']);

	for (const code of ['', '7K4M9', '7K4M9QQ']) {
		await assert.rejects(
			signedOut.app.organization.machine.connect({ link: 'rentable://join/abc', code })
		);
	}

	await assert.rejects(signedOut.app.organization.machine.connect({ link: '  ', code: '7K4M9Q' }));
	assert.deepEqual(asked, ['machineLinkMake', 'machineConnect:rentable://join/abc:7K4M9Q']);
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

// effort 826, requirement 22: ending a member's sessions is `resetPassword`'s, and ending the
// reader's own on their other machines is any signed-in member's. What each refuses on the row
// itself, the caller's own and the owner's, is Rust's. Both hand back whether the bump reached the
// organization database, which is what the announcement turns on: a machine with no connection
// wrote the number on its own replica and the other machines are still open.
test('ending sessions reaches the host behind reset password, and ending your own needs only a session', async () => {
	const asked: string[] = [];
	const host = fakeHost({
		organization: {
			...fakeHost().organization,
			sessionEndElsewhere: async () => {
				asked.push('endElsewhere');

				return { sent: false };
			},
			member: {
				...fakeHost().organization.member,
				endSessions: async (memberId) => {
					asked.push(`endSessions:${memberId}`);

					return { sent: true };
				}
			}
		}
	});

	const resetting = await permittedApi(host, 'resetPassword');

	assert.deepEqual(await resetting.app.organization.member.endSessions({ memberId: 'member-2' }), {
		sent: true
	});
	assert.deepEqual(await resetting.app.organization.session.endElsewhere(), { sent: false });

	assert.deepEqual(asked, ['endSessions:member-2', 'endElsewhere']);

	// a member holding no act ends their own sessions and nobody else's.
	const without = await permittedApi(host);

	await without.app.organization.session.endElsewhere();
	await assert.rejects(without.app.organization.member.endSessions({ memberId: 'member-2' }));

	assert.deepEqual(asked, ['endSessions:member-2', 'endElsewhere', 'endElsewhere']);

	// and nobody at all ends anything.
	const signedOut = await signedOutApi(host);

	await assert.rejects(signedOut.app.organization.session.endElsewhere());
	await assert.rejects(signedOut.app.organization.member.endSessions({ memberId: 'member-2' }));
	assert.deepEqual(asked, ['endSessions:member-2', 'endElsewhere', 'endElsewhere']);
});

// requirement 23: a rename is held to requirement 21's rules before the host is reached, and what
// reaches the host is the trimmed username; a caller without `renameMember` is refused before
// either. Whether the username is taken is Rust's alone.
test('a rename hands the trimmed username on, refuses one outside the rules first, and needs the renaming act', async () => {
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
						workspaces: [],
						pending: null,
						createdAt: 0
					};
				}
			}
		}
	});
	const api = await permittedApi(host, 'renameMember');

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

// effort 828, requirement 14: both halves of the way in that connects to an organization the
// account already holds happen on a machine that holds nothing, so both are public and both reach
// the host and nothing else. The username is trimmed the way the create trims it; the password
// crosses in untouched and nothing about it crosses back.
test('inspecting the group and connecting to what it holds reach the host signed out', async () => {
	const asked: string[] = [];
	const api = await signedOutApi(hostRecording(asked));

	const group = await api.app.organization.groupInspect();
	const connected = await api.app.organization.connectExisting({
		username: ' Olivia.Owner ',
		password: 'the owners password'
	});

	assert.deepEqual(group, { kind: 'held', organizationId: '7f3a' });
	assert.equal(connected.organization?.role, 'owner');
	assert.deepEqual(asked, ['groupInspect', 'connectExisting:Olivia.Owner:19']);
});

// and the same two bounds the create states, refused before the host is reached: a username
// outside the rules and a password under the floor.
test('a username outside the rules or a password under the floor never reaches the connect', async () => {
	const asked: string[] = [];
	const api = await signedOutApi(hostRecording(asked));

	await assert.rejects(
		api.app.organization.connectExisting({
			username: 'olivia',
			password: 'x'.repeat(PASSWORD_FLOOR - 1)
		})
	);

	for (const username of ['ol', 'o'.repeat(33), 'olivia owner', '']) {
		await assert.rejects(
			api.app.organization.connectExisting({
				username,
				password: 'a long enough password'
			}),
			username
		);
	}

	assert.deepEqual(asked, []);
});
