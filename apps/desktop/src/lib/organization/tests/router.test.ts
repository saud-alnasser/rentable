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
	fakeOrganizationMember,
	fakeOrganizationState
} from '$lib/platform/tests/testing.ts';
import { fakeIdentity } from '$lib/api/tests/testing.ts';
import { maskOf, type Flag } from '@rentable/workspace-permission';
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

// effort 838, requirements 5 and 6: a role, an override and a withdrawal each reach the host behind
// their own flag, and a caller whose row carries none of them is refused before the round trip.
// What is refused on the rows themselves (rank, the caller's own row, flags not held) is Rust's.
test('assigning a role, setting an override and withdrawing a grant each need their flag', async () => {
	const asked: string[] = [];
	const host = fakeHost({
		organization: {
			...fakeHost().organization,
			member: {
				...fakeHost().organization.member,
				assignRole: async (memberId, roleId) => {
					asked.push(`assignRole:${memberId}:${roleId}`);

					return fakeOrganizationMember({ id: memberId, roleId });
				},
				setOverride: async (memberId, override) => {
					asked.push(`setOverride:${memberId}:${override}`);

					return fakeOrganizationMember({ id: memberId, override });
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

	const assigning = await permittedApi(host, 'assignRole');
	const overriding = await permittedApi(host, 'overrideMember');
	const granting = await permittedApi(host, 'grantWorkspace');

	await assigning.app.organization.member.assignRole({ memberId: 'member-2', roleId: 'role-7' });
	await overriding.app.organization.member.setOverride({ memberId: 'member-2', override: 8 });
	await granting.app.organization.workspace.withdraw({
		workspaceId: 'workspace-1',
		memberId: 'member-2'
	});

	const done = [
		'assignRole:member-2:role-7',
		'setOverride:member-2:8',
		'withdraw:workspace-1:member-2'
	];

	assert.deepEqual(asked, done);

	// and no flag stands in for another.
	await assert.rejects(
		overriding.app.organization.member.assignRole({ memberId: 'member-2', roleId: 'role-7' })
	);
	await assert.rejects(
		assigning.app.organization.member.setOverride({ memberId: 'member-2', override: 8 })
	);
	await assert.rejects(
		assigning.app.organization.workspace.withdraw({
			workspaceId: 'workspace-1',
			memberId: 'member-2'
		})
	);
	assert.deepEqual(asked, done);
});

// effort 838, requirement 4: every write to a role is `manageRoles`'s, and listing them is any
// signed-in member's. What each write refuses on the rows (rank, a built-in role, flags not held)
// is Rust's.
test('the roles are listed to anybody signed in, and every write to one needs manageRoles', async () => {
	const asked: string[] = [];
	const role = {
		id: 'role-7',
		kind: 'custom' as const,
		name: 'collector',
		mask: 0,
		rank: 500_000,
		holders: 0
	};
	const host = fakeHost({
		organization: {
			...fakeHost().organization,
			roles: async () => [role],
			role: {
				create: async (name, mask, afterRoleId) => {
					asked.push(`create:${name}:${mask}:${afterRoleId}`);

					return role;
				},
				rename: async (roleId, name) => {
					asked.push(`rename:${roleId}:${name}`);

					return role;
				},
				setMask: async (roleId, mask) => {
					asked.push(`setMask:${roleId}:${mask}`);

					return role;
				},
				move: async (roleId, afterRoleId) => {
					asked.push(`move:${roleId}:${afterRoleId}`);

					return role;
				},
				remove: async (roleId) => {
					asked.push(`remove:${roleId}`);
				}
			}
		}
	});

	const nobody = await permittedApi(host);

	assert.deepEqual(await nobody.app.organization.role.list(), [role]);
	await assert.rejects(nobody.app.organization.role.delete({ roleId: 'role-7' }));
	await assert.rejects(
		nobody.app.organization.role.create({ name: 'collector', mask: 0, afterRoleId: 'manager' })
	);

	const managing = await permittedApi(host, 'manageRoles');

	await managing.app.organization.role.create({
		name: ' collector ',
		mask: 0,
		afterRoleId: 'manager'
	});
	await managing.app.organization.role.rename({ roleId: 'role-7', name: 'collector' });
	await managing.app.organization.role.setMask({ roleId: 'role-7', mask: 8 });
	await managing.app.organization.role.move({ roleId: 'role-7', afterRoleId: 'manager' });
	await managing.app.organization.role.delete({ roleId: 'role-7' });

	// a blank name is refused before the round trip.
	await assert.rejects(
		managing.app.organization.role.create({ name: '  ', mask: 0, afterRoleId: 'manager' })
	);

	assert.deepEqual(asked, [
		'create:collector:0:manager',
		'rename:role-7:collector',
		'setMask:role-7:8',
		'move:role-7:manager',
		'remove:role-7'
	]);
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
		'delete',
		'disconnect',
		'groupInspect',
		'invitation.accept',
		'machine.connect',
		'mark.clear',
		'mark.get',
		'mark.set',
		'member.assignRole',
		'member.create',
		'member.endSessions',
		'member.linkMake',
		'member.list',
		'member.lockOutCost',
		'member.offerOwnership',
		'member.remove',
		'member.rename',
		'member.setOverride',
		'member.standings',
		'member.unsetPassword',
		'member.withdrawOffer',
		'ownershipAccept',
		'password.change',
		'role.create',
		'role.delete',
		'role.list',
		'role.move',
		'role.rename',
		'role.setMask',
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

// effort 828, requirement 19 from this side: where each account stands is asked beside the list
// and answered for every member at once, under any signed-in member's procedure. The directory
// joins the two on the member's id, and a reader with no session reaches neither. *There was a
// procedure that copied an invitation's link and code until requirement 19 settled what a card
// offers: a link is shown once when it is made, and a person who lost the pair makes another.*
test('where each account stands is answered for every member, to any signed-in member', async () => {
	let asked = 0;
	const host = fakeHost({
		organization: {
			...fakeHost().organization,
			member: {
				...fakeHost().organization.member,
				standings: async () => {
					asked += 1;

					return [
						{ memberId: 'member-1', passwordSet: true, machineSignedIn: true },
						{ memberId: 'member-2', passwordSet: false, machineSignedIn: false }
					];
				}
			}
		}
	});
	// a plain member: a session with no administration act on it, which is what `permittedApi`
	// builds when it is named none.
	const member = await permittedApi(host);
	const standings = await member.app.organization.member.standings();

	assert.deepEqual(standings, [
		{ memberId: 'member-1', passwordSet: true, machineSignedIn: true },
		{ memberId: 'member-2', passwordSet: false, machineSignedIn: false }
	]);
	assert.equal(asked, 1);

	const signedOut = await signedOutApi(host);

	await assert.rejects(signedOut.app.organization.member.standings());
	assert.equal(asked, 1);
});

// effort 828, requirement 20 from this side: one act makes a link for an account, and it is held to
// `inviteMember` **or** `resetPassword`. What it hands somebody is the way a machine joins an
// account, which is what making an account was always half of; it is also the only thing that
// restores an account whose password `unsetPassword` beside it took away, and that act is
// `resetPassword`'s. Held to the first alone, a member widened with the second and not the first
// could take a password away and could not hand back the link that gives one; the human struck
// that risk on 2026-09-16. Opening a link happens on a machine where nobody has signed in yet, so
// the connect is public. The code is six characters here as it is on an invitation, and everything
// else about the link is Rust's.
test('making a link is held to inviteMember or resetPassword, and connecting with one reaches the host signed out', async () => {
	const asked: string[] = [];
	const host = fakeHost({
		organization: {
			...fakeHost().organization,
			member: {
				...fakeHost().organization.member,
				linkMake: async (memberId) => {
					asked.push(`linkMake:${memberId}`);

					return {
						link: 'rentable://join/abc',
						code: '7K4M9Q',
						expiresAt: 1_757_604_800_000,
						unreachableWorkspaces: []
					};
				}
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
		signedOut.app.organization.member.linkMake({ memberId: 'member-2' }),
		'a link was made by nobody'
	);
	assert.deepEqual(asked, []);

	// a member with no act of their own is refused before the host is reached.
	const member = await permittedApi(host);

	await assert.rejects(member.app.organization.member.linkMake({ memberId: 'member-2' }));
	assert.deepEqual(asked, []);

	const inviting = await permittedApi(host, 'inviteMember');
	const made = await inviting.app.organization.member.linkMake({ memberId: 'member-2' });

	assert.equal(made.code, '7K4M9Q');
	assert.equal(made.link, 'rentable://join/abc');
	assert.deepEqual(asked, ['linkMake:member-2']);

	// and a holder of the other act alone, who is whoever can take the password away.
	const resetting = await permittedApi(host, 'resetPassword');

	assert.equal(
		(await resetting.app.organization.member.linkMake({ memberId: 'member-3' })).code,
		'7K4M9Q'
	);
	assert.deepEqual(asked, ['linkMake:member-2', 'linkMake:member-3']);

	const connected = await signedOut.app.organization.machine.connect({
		link: ' rentable://join/abc ',
		code: '7K4M9Q'
	});

	assert.equal(connected.organization?.memberId, null, 'a connect recorded a member');
	assert.equal(connected.session, null, 'a connect opened a vault');
	assert.deepEqual(asked, [
		'linkMake:member-2',
		'linkMake:member-3',
		'machineConnect:rentable://join/abc:7K4M9Q'
	]);

	for (const code of ['', '7K4M9', '7K4M9QQ']) {
		await assert.rejects(
			signedOut.app.organization.machine.connect({ link: 'rentable://join/abc', code })
		);
	}

	await assert.rejects(signedOut.app.organization.machine.connect({ link: '  ', code: '7K4M9Q' }));
	assert.deepEqual(asked, [
		'linkMake:member-2',
		'linkMake:member-3',
		'machineConnect:rentable://join/abc:7K4M9Q'
	]);
});

// effort 828, requirement 20: making an account and unsetting its password are two acts behind two
// different bits, because making somebody a way in and taking one away are different things to be
// trusted with. What each writes is Rust's; what is read here is which bit each is held to and what
// crosses.
test('making an account is inviteMember and unsetting a password is resetPassword', async () => {
	const asked: string[] = [];
	const host = fakeHost({
		organization: {
			...fakeHost().organization,
			member: {
				...fakeHost().organization.member,
				create: async (username, roleId, override, workspaces) => {
					asked.push(`create:${username}:${roleId}:${override}:${workspaces.length}`);

					return fakeOrganizationMember({
						id: 'member-9',
						username,
						roleId,
						override,
						workspaces,
						createdAt: 1_757_000_000_000
					});
				},
				unsetPassword: async (memberId) => {
					asked.push(`unsetPassword:${memberId}`);

					return [{ id: 'workspace-9', name: 'South' }];
				}
			}
		}
	});
	const inviting = await permittedApi(host, 'inviteMember');
	const account = await inviting.app.organization.member.create({
		username: '  sami.staff  ',
		roleId: 'member',
		override: 0,
		workspaces: [{ id: 'workspace-1', access: 'full-access' }]
	});

	assert.equal(account.username, 'sami.staff', 'the username was not trimmed before the host');
	assert.deepEqual(asked, ['create:sami.staff:member:0:1']);

	// unsetting is a different bit, so the caller who makes accounts is refused it.
	await assert.rejects(inviting.app.organization.member.unsetPassword({ memberId: 'member-2' }));

	const resetting = await permittedApi(host, 'resetPassword');

	assert.deepEqual(
		await resetting.app.organization.member.unsetPassword({ memberId: 'member-2' }),
		[{ id: 'workspace-9', name: 'South' }]
	);
	// and making an account is refused to the caller who only resets.
	await assert.rejects(
		resetting.app.organization.member.create({
			username: 'sami.staff',
			roleId: 'member',
			override: 0,
			workspaces: []
		})
	);
	assert.deepEqual(asked, ['create:sami.staff:member:0:1', 'unsetPassword:member-2']);
});

/**
 * a caller whose row carries the acts named, the way `api/tests/procedure.test.ts` builds one:
 * the real context with an identity in it, and the host above recording what reached it.
 */
async function permittedApi(host: Host, ...acts: Flag[]) {
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

// effort 828, requirement 18: deleting the organization needs somebody signed in and a password,
// and it hands both on as given. It is `member` here rather than an act, because there is no act a
// role could be given for it: it needs the platform authority only the owner's machine holds, and
// the owner check is Rust's, on the role the password opened. A caller with nobody signed in is
// refused before the host is reached, and so is an empty password.
test('deleting the organization needs a session and a password, and reaches the host with it', async () => {
	const asked: string[] = [];
	const host = fakeHost({
		organization: {
			...fakeHost().organization,
			delete: async (password) => {
				asked.push(`delete:${password}`);

				return fakeOrganizationState({ organization: null, session: null });
			}
		}
	});

	const member = await permittedApi(host);
	const deleted = await member.app.organization.delete({ password: 'the owners password' });

	assert.equal(deleted.organization, null);
	assert.deepEqual(asked, ['delete:the owners password']);

	await assert.rejects(member.app.organization.delete({ password: '' }));

	const signedOut = await signedOutApi(host);

	await assert.rejects(signedOut.app.organization.delete({ password: 'the owners password' }));
	assert.deepEqual(asked, ['delete:the owners password']);
});

// effort 828, requirement 22: a handover is three procedures, and each of the three is `member`
// here rather than an act, for the reason deleting the organization is: being the owner is what a
// password opened rather than a bit on a row, so the owner check and the password are Rust's. A
// caller with nobody signed in is refused before the host is reached, and so is an empty password
// or an empty account.
test('the three acts of a handover need a session, and the offer needs an account and a password', async () => {
	const asked: string[] = [];
	const host = fakeHost({
		organization: {
			...fakeHost().organization,
			member: {
				...fakeHost().organization.member,
				offerOwnership: async (memberId, password) => {
					asked.push(`offer:${memberId}:${password}`);

					return fakeOrganizationMember({
						id: memberId,
						username: 'ada',
						role: 'manager',
						permissions: 127,
						offeredOwnership: true
					});
				},
				withdrawOffer: async () => {
					asked.push('withdraw');
				}
			},
			ownershipAccept: async (password) => {
				asked.push(`accept:${password}`);

				return fakeOrganizationState();
			}
		}
	});

	const member = await permittedApi(host);
	const offered = await member.app.organization.member.offerOwnership({
		memberId: 'member-2',
		password: 'the owners password'
	});

	assert.equal(offered.offeredOwnership, true);

	await member.app.organization.member.withdrawOffer();
	await member.app.organization.ownershipAccept({ password: 'their own password' });

	assert.deepEqual(asked, [
		'offer:member-2:the owners password',
		'withdraw',
		'accept:their own password'
	]);

	await assert.rejects(
		member.app.organization.member.offerOwnership({ memberId: 'member-2', password: '' })
	);
	await assert.rejects(
		member.app.organization.member.offerOwnership({
			memberId: ' ',
			password: 'the owners password'
		})
	);
	await assert.rejects(member.app.organization.ownershipAccept({ password: '' }));

	const signedOut = await signedOutApi(host);

	await assert.rejects(
		signedOut.app.organization.member.offerOwnership({
			memberId: 'member-2',
			password: 'the owners password'
		})
	);
	await assert.rejects(signedOut.app.organization.member.withdrawOffer());
	await assert.rejects(
		signedOut.app.organization.ownershipAccept({ password: 'their own password' })
	);
	assert.deepEqual(asked, [
		'offer:member-2:the owners password',
		'withdraw',
		'accept:their own password'
	]);
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

					return fakeOrganizationMember({ id: memberId, username });
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
