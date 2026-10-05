import assert from 'node:assert/strict';
import test from 'node:test';

import { appRouter } from '$lib/app/router.ts';
import { caller, context, type Meta } from '$lib/api/trpc.ts';
import organization from '$lib/organization/router.ts';
import { PASSWORD_FLOOR } from '$lib/organization/setup/setup.ts';
import { createMemoryDatabase } from '$lib/platform/database/memory.ts';
import { fakeHost } from '$lib/app/tests/host.ts';
import {
	fakeHeldOrganization,
	fakeOrganizationMember,
	fakeOrganizationState
} from '$lib/organization/tests/testing.ts';
import { fakeIdentity } from '$lib/app/tests/testing.ts';
import { BUILT_IN, EVERY_FLAG, maskOf, type Flag } from '@rentable/workspace-permission';
import { readRefusal } from '$lib/api/refusal.ts';
import type { Host } from '$lib/app/host.ts';
import type { AnyProcedure } from '@trpc/server';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * THE ORGANIZATION ROUTER
 *
 * The router's procedures reach `ctx.host` alone: the consent and the first run are `public`, and
 * everything after is a member's own act or names its flag. What is worth pinning is what the router
 * refuses before the host is
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

	const started = await api.organization.consent.begin();
	const result = await api.organization.consent.result({ sessionId: started.sessionId });
	await api.organization.consent.disconnect();

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

	const forgotten = await api.organization.disconnect();

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

	const created = await api.organization.create({
		name: '  Acme Rentals ',
		username: ' Olivia.Owner ',
		password: 'a long enough password'
	});

	assert.equal(created.organizationId, 'org-1');

	await api.organization.create({
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

	await assert.rejects(api.organization.create({ name: '   ', username: 'olivia', password }));
	await assert.rejects(
		api.organization.create({
			name: 'Acme',
			username: 'olivia',
			password: 'x'.repeat(PASSWORD_FLOOR - 1)
		})
	);
	await assert.rejects(
		api.organization.create({ name: 'Acme', username: 'olivia', password, group: '   ' })
	);

	for (const username of ['ol', 'o'.repeat(33), 'olivia owner', 'olivia@acme.example', '']) {
		await assert.rejects(api.organization.create({ name: 'Acme', username, password }), username);
	}

	assert.deepEqual(asked, []);
});

// effort 838, requirements 5 and 6: a role, an override and a withdrawal each reach the host behind
// their own flag, and a caller whose row carries none of them is refused before the round trip.
// What is refused on the rows themselves (rank, the caller's own row, flags not held) is Rust's.
// *The roles and the member list were added by ticket 42, when the router began reading the role's
// mask to refuse an override that writes a kind of record without viewing it.*
test('assigning a role, setting an override and withdrawing a grant each need their flag', async () => {
	const asked: string[] = [];
	const host = fakeHost({
		organization: {
			...fakeHost().organization,
			roles: async () => [
				{ id: 'role-7', kind: 'custom', name: 'collector', mask: 0, rank: 500_000, holders: 1 }
			],
			member: {
				...fakeHost().organization.member,
				list: async () => [fakeOrganizationMember({ id: 'member-2', roleId: 'role-7' })],
				assignRole: async (memberId, roleId, override) => {
					asked.push(`assignRole:${memberId}:${roleId}:${override}`);

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

	await assigning.organization.member.assignRole({ memberId: 'member-2', roleId: 'role-7' });
	// and an override riding with the role reaches the host with it, as one act.
	await assigning.organization.member.assignRole({
		memberId: 'member-2',
		roleId: 'role-7',
		override: 8
	});
	await overriding.organization.member.setOverride({ memberId: 'member-2', override: 8 });
	await granting.organization.workspace.withdraw({
		workspaceId: 'workspace-1',
		memberId: 'member-2'
	});

	const done = [
		'assignRole:member-2:role-7:undefined',
		'assignRole:member-2:role-7:8',
		'setOverride:member-2:8',
		'withdraw:workspace-1:member-2'
	];

	assert.deepEqual(asked, done);

	// and no flag stands in for another.
	await assert.rejects(
		overriding.organization.member.assignRole({ memberId: 'member-2', roleId: 'role-7' })
	);
	await assert.rejects(
		assigning.organization.member.setOverride({ memberId: 'member-2', override: 8 })
	);
	await assert.rejects(
		assigning.organization.workspace.withdraw({
			workspaceId: 'workspace-1',
			memberId: 'member-2'
		})
	);
	assert.deepEqual(asked, done);
});

// effort 838, requirement 12 as amended a third time: what is pinned for a member in one
// workspace, and which of it is on, is `overrideMember`'s, like their override across the
// organization. A pin naming a flag that is not a record flag, a flag granted and not pinned, and
// a write turned on there for a kind of record they cannot view are refused before the round trip;
// a write the layers beneath carry without its view is dropped where it is read, so a view pinned
// off beside it is not refused. The rest (rank, the grant, flags not held) is Rust's.
test('tailoring a member in a workspace needs overrideMember, and asks for record flags a member can view', async () => {
	const asked: string[] = [];
	const host = fakeHost({
		organization: {
			...fakeHost().organization,
			member: {
				...fakeHost().organization.member,
				list: async () => [
					fakeOrganizationMember({ id: 'member-2', permissions: BUILT_IN.member.mask })
				],
				setWorkspaceOverride: async (memberId, workspaceId, pinned, granted) => {
					asked.push(`setWorkspaceOverride:${memberId}:${workspaceId}:${pinned}:${granted}`);

					return fakeOrganizationMember({ id: memberId });
				}
			}
		}
	});

	const overriding = await permittedApi(host, 'overrideMember');
	const granting = await permittedApi(host, 'grantWorkspace', 'assignRole');
	const readOnly = maskOf('createPayment', 'editPayment');
	const deleting = maskOf('deletePayment');

	await overriding.organization.member.setWorkspaceOverride({
		memberId: 'member-2',
		workspaceId: 'workspace-1',
		pinned: readOnly,
		granted: 0
	});
	await overriding.organization.member.setWorkspaceOverride({
		memberId: 'member-2',
		workspaceId: 'workspace-1',
		pinned: deleting,
		granted: deleting
	});
	await overriding.organization.member.setWorkspaceOverride({
		memberId: 'member-2',
		workspaceId: 'workspace-1',
		pinned: 0,
		granted: 0
	});

	// payments out of sight there: the member's role still adds them, which the reading drops.
	const unseen = maskOf('viewPayment');

	await overriding.organization.member.setWorkspaceOverride({
		memberId: 'member-2',
		workspaceId: 'workspace-1',
		pinned: unseen,
		granted: 0
	});

	const done = [
		`setWorkspaceOverride:member-2:workspace-1:${readOnly}:0`,
		`setWorkspaceOverride:member-2:workspace-1:${deleting}:${deleting}`,
		'setWorkspaceOverride:member-2:workspace-1:0:0',
		`setWorkspaceOverride:member-2:workspace-1:${unseen}:0`
	];

	assert.deepEqual(asked, done);

	const refusedAs = async (call: Promise<unknown>, code: string): Promise<void> => {
		await assert.rejects(call, (error: unknown) => {
			assert.equal(readRefusal(error)?.code, code);

			return true;
		});
	};

	// no other flag stands in for it.
	await assert.rejects(
		granting.organization.member.setWorkspaceOverride({
			memberId: 'member-2',
			workspaceId: 'workspace-1',
			pinned: readOnly,
			granted: 0
		})
	);
	// the organization's own flags are not a workspace's to pin.
	await refusedAs(
		overriding.organization.member.setWorkspaceOverride({
			memberId: 'member-2',
			workspaceId: 'workspace-1',
			pinned: maskOf('inviteMember'),
			granted: 0
		}),
		'host.recordFlagsOnly'
	);
	// nothing is granted there that is not pinned.
	await refusedAs(
		overriding.organization.member.setWorkspaceOverride({
			memberId: 'member-2',
			workspaceId: 'workspace-1',
			pinned: deleting,
			granted: maskOf('deletePayment', 'deleteUnit')
		}),
		'host.recordFlagsOnly'
	);
	// deleting payments turned on there, with their view pinned off beside it.
	await refusedAs(
		overriding.organization.member.setWorkspaceOverride({
			memberId: 'member-2',
			workspaceId: 'workspace-1',
			pinned: maskOf('viewPayment', 'deletePayment'),
			granted: maskOf('deletePayment')
		}),
		'host.paymentNeedsViewing'
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

	assert.deepEqual(await nobody.organization.role.list(), [role]);
	await assert.rejects(nobody.organization.role.delete({ roleId: 'role-7' }));
	await assert.rejects(
		nobody.organization.role.create({ name: 'collector', mask: 0, afterRoleId: 'manager' })
	);

	const managing = await permittedApi(host, 'manageRoles');

	await managing.organization.role.create({
		name: ' collector ',
		mask: 0,
		afterRoleId: 'manager'
	});
	await managing.organization.role.rename({ roleId: 'role-7', name: 'collector' });
	await managing.organization.role.setMask({ roleId: 'role-7', mask: 8 });
	await managing.organization.role.move({ roleId: 'role-7', afterRoleId: 'manager' });
	await managing.organization.role.delete({ roleId: 'role-7' });

	// a blank name is refused before the round trip.
	await assert.rejects(
		managing.organization.role.create({ name: '  ', mask: 0, afterRoleId: 'manager' })
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
		'member.setWorkspaceOverride',
		'member.standings',
		'member.unlock',
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
		'session.endMachine',
		'session.machines',
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

	const admitted = await api.organization.invitation.accept({
		link: ' rentable://join/abc ',
		code: '7K4M9Q',
		password: 'a password sami chose'
	});

	assert.equal(admitted.organization?.memberId, 'member-2');
	assert.deepEqual(asked, ['accept:rentable://join/abc:7K4M9Q:21']);

	await assert.rejects(
		api.organization.invitation.accept({
			link: 'rentable://join/abc',
			code: '7K4M9Q',
			password: 'x'.repeat(PASSWORD_FLOOR - 1)
		})
	);
	await assert.rejects(
		api.organization.invitation.accept({
			link: '  ',
			code: '7K4M9Q',
			password: 'a password sami chose'
		})
	);

	for (const code of ['', '7K4M9', '7K4M9QQ']) {
		await assert.rejects(
			api.organization.invitation.accept({
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
						{ memberId: 'member-1', passwordSet: true, machineSignedIn: true, locked: false },
						{ memberId: 'member-2', passwordSet: false, machineSignedIn: false, locked: false }
					];
				}
			}
		}
	});
	// a plain member: a session with no administration act on it, which is what `permittedApi`
	// builds when it is named none.
	const member = await permittedApi(host);
	const standings = await member.organization.member.standings();

	assert.deepEqual(standings, [
		{ memberId: 'member-1', passwordSet: true, machineSignedIn: true, locked: false },
		{ memberId: 'member-2', passwordSet: false, machineSignedIn: false, locked: false }
	]);
	assert.equal(asked, 1);

	const signedOut = await signedOutApi(host);

	await assert.rejects(signedOut.organization.member.standings());
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
				linkMake: async (memberId, lifetimeHours) => {
					asked.push(`linkMake:${memberId}:${lifetimeHours}`);

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
		signedOut.organization.member.linkMake({ memberId: 'member-2', lifetimeHours: 72 }),
		'a link was made by nobody'
	);
	assert.deepEqual(asked, []);

	// a member with no act of their own is refused before the host is reached.
	const member = await permittedApi(host);

	await assert.rejects(
		member.organization.member.linkMake({ memberId: 'member-2', lifetimeHours: 72 })
	);
	assert.deepEqual(asked, []);

	const inviting = await permittedApi(host, 'inviteMember');
	const made = await inviting.organization.member.linkMake({
		memberId: 'member-2',
		lifetimeHours: 72
	});

	assert.equal(made.code, '7K4M9Q');
	assert.equal(made.link, 'rentable://join/abc');
	assert.deepEqual(asked, ['linkMake:member-2:72']);

	// effort 851, requirement 11: the lifetime is one of the steps, every hour to a day, every day
	// to a week, and a week; anything else is refused before the host is reached, as Rust refuses it.
	for (const lifetimeHours of [0, 25, 169, 200, 1.5, -24]) {
		await assert.rejects(
			inviting.organization.member.linkMake({ memberId: 'member-2', lifetimeHours }),
			`${lifetimeHours} hours made a link`
		);
	}

	assert.deepEqual(asked, ['linkMake:member-2:72']);

	// and a holder of the other act alone, who is whoever can take the password away.
	const resetting = await permittedApi(host, 'resetPassword');

	assert.equal(
		(await resetting.organization.member.linkMake({ memberId: 'member-3', lifetimeHours: 1 })).code,
		'7K4M9Q'
	);
	assert.deepEqual(asked, ['linkMake:member-2:72', 'linkMake:member-3:1']);

	const connected = await signedOut.organization.machine.connect({
		link: ' rentable://join/abc ',
		code: '7K4M9Q'
	});

	assert.equal(connected.organization?.memberId, null, 'a connect recorded a member');
	assert.equal(connected.session, null, 'a connect opened a vault');
	assert.deepEqual(asked, [
		'linkMake:member-2:72',
		'linkMake:member-3:1',
		'machineConnect:rentable://join/abc:7K4M9Q'
	]);

	for (const code of ['', '7K4M9', '7K4M9QQ']) {
		await assert.rejects(
			signedOut.organization.machine.connect({ link: 'rentable://join/abc', code })
		);
	}

	await assert.rejects(signedOut.organization.machine.connect({ link: '  ', code: '7K4M9Q' }));
	assert.deepEqual(asked, [
		'linkMake:member-2:72',
		'linkMake:member-3:1',
		'machineConnect:rentable://join/abc:7K4M9Q'
	]);
});

// effort 828, requirement 20: making an account and unsetting its password are two acts behind two
// different bits, because making somebody a way in and taking one away are different things to be
// trusted with. What each writes is Rust's; what is read here is which bit each is held to and what
// crosses.
test('making an account is inviteMember and unsetting a password is resetPassword, each with grantWorkspace', async () => {
	const asked: string[] = [];
	const host = fakeHost({
		organization: {
			...fakeHost().organization,
			roles: async () => [{ ...BUILT_IN.member, kind: 'member', name: '', holders: 0 }],
			member: {
				...fakeHost().organization.member,
				create: async (username, roleId, override, workspaces) => {
					asked.push(`create:${username}:${roleId}:${override}:${workspaces.length}`);

					return fakeOrganizationMember({
						id: 'member-9',
						username,
						roleId,
						override,
						workspaces: workspaces.map((grant) => ({
							...grant,
							pinned: 0,
							granted: 0,
							permissions: 0
						})),
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
	// each writes the account's grant on the organization database, which is grantWorkspace's row.
	await assert.rejects(
		(await permittedApi(host, 'inviteMember')).organization.member.create({
			username: 'sami.staff',
			roleId: 'member',
			override: 0,
			workspaces: []
		}),
		/grantWorkspace/
	);
	const inviting = await permittedApi(host, 'inviteMember', 'grantWorkspace');
	const account = await inviting.organization.member.create({
		username: '  sami.staff  ',
		roleId: 'member',
		override: 0,
		workspaces: [{ id: 'workspace-1', access: 'full-access' }]
	});

	assert.equal(account.username, 'sami.staff', 'the username was not trimmed before the host');
	assert.deepEqual(asked, ['create:sami.staff:member:0:1']);

	// unsetting is a different bit, so the caller who makes accounts is refused it.
	await assert.rejects(inviting.organization.member.unsetPassword({ memberId: 'member-2' }));

	await assert.rejects(
		(await permittedApi(host, 'resetPassword')).organization.member.unsetPassword({
			memberId: 'member-2'
		}),
		/grantWorkspace/
	);
	const resetting = await permittedApi(host, 'resetPassword', 'grantWorkspace');

	assert.deepEqual(await resetting.organization.member.unsetPassword({ memberId: 'member-2' }), [
		{ id: 'workspace-9', name: 'South' }
	]);
	// and making an account is refused to the caller who only resets.
	await assert.rejects(
		resetting.organization.member.create({
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

	assert.deepEqual(await resetting.organization.member.endSessions({ memberId: 'member-2' }), {
		sent: true
	});
	assert.deepEqual(await resetting.organization.session.endElsewhere(), { sent: false });

	assert.deepEqual(asked, ['endSessions:member-2', 'endElsewhere']);

	// a member holding no act ends their own sessions and nobody else's.
	const without = await permittedApi(host);

	await without.organization.session.endElsewhere();
	await assert.rejects(without.organization.member.endSessions({ memberId: 'member-2' }));

	assert.deepEqual(asked, ['endSessions:member-2', 'endElsewhere', 'endElsewhere']);

	// and nobody at all ends anything.
	const signedOut = await signedOutApi(host);

	await assert.rejects(signedOut.organization.session.endElsewhere());
	await assert.rejects(signedOut.organization.member.endSessions({ memberId: 'member-2' }));
	assert.deepEqual(asked, ['endSessions:member-2', 'endElsewhere', 'endElsewhere']);
});

// effort 828, requirement 18: deleting the organization needs somebody signed in and a password,
// and it hands both on as given. It is the owner's `deleteOrganization` here as it is in Rust
// (ticket 17 of effort 838), and whether the password opens the owner's vault is Rust's. A caller
// with nobody signed in is refused before the host is reached, and so are a caller without the
// flag and an empty password.
test('deleting the organization needs deleteOrganization and a password, and reaches the host with it', async () => {
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

	const owner = await permittedApi(host, 'deleteOrganization');
	const deleted = await owner.organization.delete({ password: 'the owners password' });

	assert.equal(deleted.organization, null);
	assert.deepEqual(asked, ['delete:the owners password']);

	await assert.rejects(owner.organization.delete({ password: '' }));

	const member = await permittedApi(host);

	await assert.rejects(member.organization.delete({ password: 'the owners password' }));

	const signedOut = await signedOutApi(host);

	await assert.rejects(signedOut.organization.delete({ password: 'the owners password' }));
	assert.deepEqual(asked, ['delete:the owners password']);
});

// effort 828, requirement 22: a handover is three procedures. Offering and withdrawing are the
// owner's `transferOwnership` here as they are in Rust (ticket 17 of effort 838), and accepting is
// the reader's own act, so `member`; the password is Rust's throughout. A caller with nobody
// signed in is refused before the host is reached, and so is an empty password or an empty
// account.
test('the three acts of a handover need a session, the offer and its withdrawal transferOwnership, and the offer an account and a password', async () => {
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

	const owner = await permittedApi(host, 'transferOwnership');
	const member = await permittedApi(host);
	const offered = await owner.organization.member.offerOwnership({
		memberId: 'member-2',
		password: 'the owners password'
	});

	assert.equal(offered.offeredOwnership, true);

	await owner.organization.member.withdrawOffer();
	// accepting asks for no flag: the member accepts an offer made to them.
	await member.organization.ownershipAccept({ password: 'their own password' });

	assert.deepEqual(asked, [
		'offer:member-2:the owners password',
		'withdraw',
		'accept:their own password'
	]);

	await assert.rejects(
		owner.organization.member.offerOwnership({ memberId: 'member-2', password: '' })
	);
	await assert.rejects(
		owner.organization.member.offerOwnership({
			memberId: ' ',
			password: 'the owners password'
		})
	);
	await assert.rejects(member.organization.ownershipAccept({ password: '' }));
	await assert.rejects(
		member.organization.member.offerOwnership({
			memberId: 'member-2',
			password: 'the owners password'
		})
	);
	await assert.rejects(member.organization.member.withdrawOffer());

	const signedOut = await signedOutApi(host);

	await assert.rejects(
		signedOut.organization.member.offerOwnership({
			memberId: 'member-2',
			password: 'the owners password'
		})
	);
	await assert.rejects(signedOut.organization.member.withdrawOffer());
	await assert.rejects(signedOut.organization.ownershipAccept({ password: 'their own password' }));
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

	const renamed = await api.organization.member.rename({
		memberId: 'member-2',
		username: ' Sami.Staff '
	});

	assert.equal(renamed.username, 'Sami.Staff');
	assert.deepEqual(asked, ['rename:member-2:Sami.Staff']);

	for (const username of ['sa', 's'.repeat(33), 'sami staff', 'sami@acme.example', '']) {
		await assert.rejects(
			api.organization.member.rename({ memberId: 'member-2', username }),
			username
		);
	}

	const without = await permittedApi(host);

	await assert.rejects(
		without.organization.member.rename({ memberId: 'member-2', username: 'sami' })
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

	const group = await api.organization.groupInspect();
	const connected = await api.organization.connectExisting({
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
		api.organization.connectExisting({
			username: 'olivia',
			password: 'x'.repeat(PASSWORD_FLOOR - 1)
		})
	);

	for (const username of ['ol', 'o'.repeat(33), 'olivia owner', '']) {
		await assert.rejects(
			api.organization.connectExisting({
				username,
				password: 'a long enough password'
			}),
			username
		);
	}

	assert.deepEqual(asked, []);
});

/**
 * EVERY ORGANIZATION MUTATION NAMES THE FLAG ITS RUST COMMAND CHECKS
 *
 * Ticket 17 of effort 838, requirements 1 and 10: the Rust command is the gate that decides, and
 * the router's flag is the refusal in front of it, so the two name the same flag. The Rust side is
 * read as text, off the `GATES` table its own test holds every organization command to, the way
 * `role/permission.rs` reads the permission package. Which command each procedure calls is written out
 * here, off `organization/tauri.ts`, because the router reaches the command through the host and
 * nothing on this side can follow the call.
 */
const COMMAND_SOURCE = readFileSync(
	fileURLToPath(new URL('../../../../tauri/src/organization/mod.rs', import.meta.url)),
	'utf8'
);

type Gate = { kind: string; flags: Flag[] };

/** `DeleteOrganization`, as Rust spells a flag, to `deleteOrganization`, as this side does. */
function flagNamed(rust: string): Flag {
	const name = `${rust[0].toLowerCase()}${rust.slice(1)}`;
	const flag = EVERY_FLAG.find((known) => known === name);

	assert.ok(flag, `GATES names ${rust}, which is no flag here`);

	return flag;
}

/**
 * Every command in `GATES`, by the name it is invoked by (the plugin's, then the name `GATES` holds),
 * with the gate it names and the flags that gate asks for.
 */
function gatesInRust(source: string): Map<string, Gate> {
	const start = source.indexOf('const GATES: &[(&str, Gate)] = &[');
	const table = source.slice(start, source.indexOf('];', start));
	const gates = new Map<string, Gate>();

	for (const [, command, kind, inner] of table.matchAll(
		/\(\s*"(\w+)",\s*Gate::(\w+)(?:\(([^()]*)\))?,?\s*\)/g
	)) {
		gates.set(`plugin:organization|${command}`, {
			kind,
			flags: [...(inner ?? '').matchAll(/Flag::(\w+)/g)].map(([, rust]) => flagNamed(rust))
		});
	}

	assert.ok(start >= 0 && gates.size > 40, `read ${gates.size} gates off organization/mod.rs`);

	return gates;
}

/** Each organization mutation and the Tauri command its host call invokes. */
const COMMAND_OF: Record<string, string> = {
	connectExisting: 'plugin:organization|setup_connect_existing',
	'consent.begin': 'plugin:organization|setup_consent_begin',
	'consent.disconnect': 'plugin:organization|setup_consent_disconnect',
	create: 'plugin:organization|setup_create',
	delete: 'plugin:organization|member_organization_delete',
	disconnect: 'plugin:organization|session_disconnect',
	groupInspect: 'plugin:organization|setup_group_inspect',
	'invitation.accept': 'plugin:organization|invitation_accept',
	'machine.connect': 'plugin:organization|invitation_machine_connect',
	'mark.clear': 'plugin:organization|mark_clear',
	'mark.set': 'plugin:organization|mark_set',
	'member.assignRole': 'plugin:organization|role_assign',
	'member.create': 'plugin:organization|invitation_member_create',
	'member.endSessions': 'plugin:organization|member_end_sessions',
	'member.linkMake': 'plugin:organization|invitation_link_make',
	'member.offerOwnership': 'plugin:organization|ownership_offer',
	'member.remove': 'plugin:organization|member_remove',
	'member.rename': 'plugin:organization|member_rename',
	'member.setOverride': 'plugin:organization|role_set_override',
	'member.setWorkspaceOverride': 'plugin:organization|role_set_workspace_override',
	'member.unlock': 'plugin:organization|member_unlock',
	'member.unsetPassword': 'plugin:organization|invitation_password_unset',
	'member.withdrawOffer': 'plugin:organization|ownership_withdraw_offer',
	ownershipAccept: 'plugin:organization|ownership_accept',
	'password.change': 'plugin:organization|member_change_password',
	'role.create': 'plugin:organization|role_create',
	'role.delete': 'plugin:organization|role_delete',
	'role.move': 'plugin:organization|role_move',
	'role.rename': 'plugin:organization|role_rename',
	'role.setMask': 'plugin:organization|role_set_mask',
	'session.endElsewhere': 'plugin:organization|session_end_elsewhere',
	'session.endMachine': 'plugin:organization|session_end_machine',
	'workspace.create': 'plugin:organization|workspace_create',
	'workspace.grant': 'plugin:organization|workspace_grant',
	'workspace.open': 'plugin:organization|workspace_open',
	'workspace.remove': 'plugin:organization|workspace_delete',
	'workspace.renewCredentials': 'plugin:organization|workspace_renew_credentials',
	'workspace.withdraw': 'plugin:organization|workspace_grant_withdraw'
};

/**
 * A flag Rust asks inside the command, on what the input asks for, beyond the one `GATES` names:
 * a removal that locks the member out is the owner's `lockOut` as well (`member/removal.rs`), and the
 * router reads it off the same input with `permittedBy`.
 */
const ALSO_ON_INPUT: Record<string, readonly Flag[]> = {
	'member.remove': ['lockOut']
};

/** What the router's meta should say, given the command's gate. */
function metaFor(path: string, gate: Gate): Meta {
	const [flag, ...rest] = gate.flags;

	switch (gate.kind) {
		case 'Public':
		case 'ThisMachine':
			return { public: true };
		case 'Own':
		case 'SignedIn':
			return { member: true };
		case 'AnyFlag':
			return { anyOf: gate.flags };
		case 'AllFlags':
			return { flags: gate.flags };
		case 'Flag':
		case 'Owner':
			assert.ok(flag && rest.length === 0, `${path}: a ${gate.kind} gate names one flag`);

			return ALSO_ON_INPUT[path] ? { byInput: [flag, ...ALSO_ON_INPUT[path]] } : { flags: [flag] };
		default:
			throw new Error(`${path}: a gate this test does not know, ${gate.kind}`);
	}
}

/** Only what a meta says about who may call, so the two sides compare field for field. */
function whoMayCall({ flags, anyOf, byInput, member, public: open }: Meta): Meta {
	return Object.fromEntries(
		Object.entries({ flags, anyOf, byInput, member, public: open }).filter(
			([, value]) => value !== undefined
		)
	);
}

const organizationProcedures: object = organization._def.procedures;
const organizationMutations = Object.entries(organizationProcedures)
	.filter(([, procedure]: [string, AnyProcedure]) => procedure._def.type === 'mutation')
	.map(([path, procedure]: [string, AnyProcedure]) => ({
		path,
		meta: whoMayCall((procedure._def.meta ?? {}) as Meta)
	}));

test('every organization mutation names the flag its Rust command is gated on', () => {
	const gates = gatesInRust(COMMAND_SOURCE);

	assert.deepEqual(
		organizationMutations.map(({ path }) => path).sort(),
		Object.keys(COMMAND_OF).sort(),
		'the mutations paired with a command are not the ones the router holds'
	);

	const named = Object.fromEntries(
		organizationMutations
			.filter(({ path }) => path in COMMAND_OF)
			.map(({ path, meta }) => [path, meta])
	);
	const gated = Object.fromEntries(
		Object.entries(COMMAND_OF).map(([path, command]) => {
			const gate = gates.get(command);

			assert.ok(gate, `${path} calls ${command}, which GATES does not hold`);

			return [path, metaFor(path, gate)];
		})
	);

	assert.deepEqual(named, gated);
});

// effort 846, requirements 9 and 10: the reader's own machines are listed, and one of them signed
// out, by any signed-in member, since what either reaches is the caller's own. The machine is
// handed on as given; what Rust refuses on it (this machine, one not the reader's, one that has
// not run this version) is Rust's. Both commands are `Gate::Own` in `GATES`, which is `member`
// here; the mutation is held to it by the walk over every mutation above, and the read here.
test('your machines are listed and one is signed out by anybody signed in, and nobody else', async () => {
	const asked: string[] = [];
	const machines = [
		{
			id: 'machine-here',
			name: "Olivia's Desk",
			seenAt: 2,
			createdAt: 1,
			isThisMachine: true,
			mayEndAlone: false
		},
		{
			id: 'machine-laptop',
			name: null,
			seenAt: 1,
			createdAt: 1,
			isThisMachine: false,
			mayEndAlone: true
		}
	];
	const host = fakeHost({
		organization: {
			...fakeHost().organization,
			machines: async () => {
				asked.push('machines');

				return machines;
			},
			endMachine: async (machineId) => {
				asked.push(`endMachine:${machineId}`);

				return { sent: false };
			}
		}
	});

	// a member holding no act at all.
	const member = await permittedApi(host);

	assert.deepEqual(await member.organization.session.machines(), machines);
	assert.deepEqual(await member.organization.session.endMachine({ machineId: 'machine-laptop' }), {
		sent: false
	});
	await assert.rejects(member.organization.session.endMachine({ machineId: '' }));
	assert.deepEqual(asked, ['machines', 'endMachine:machine-laptop']);

	const signedOut = await signedOutApi(host);

	await assert.rejects(signedOut.organization.session.machines());
	await assert.rejects(signedOut.organization.session.endMachine({ machineId: 'machine-laptop' }));
	assert.deepEqual(asked, ['machines', 'endMachine:machine-laptop']);

	// and both are gated `Own` in Rust, which reads as `member` on this side.
	const gates = gatesInRust(COMMAND_SOURCE);
	const procedures = organizationProcedures as Record<string, AnyProcedure>;

	for (const [path, command] of [
		['session.machines', 'plugin:organization|session_machines'],
		['session.endMachine', 'plugin:organization|session_end_machine']
	] as const) {
		const gate = gates.get(command);

		assert.ok(gate, `${path} calls ${command}, which GATES does not hold`);
		assert.deepEqual(whoMayCall((procedures[path]._def.meta ?? {}) as Meta), metaFor(path, gate));
		assert.deepEqual(metaFor(path, gate), { member: true });
	}
});

/**
 * Each mutation whose flag is the owner's or the mark's, with an input it takes and every flag it
 * asks for. The removal is here twice, because only the one that locks out asks for `lockOut`.
 */
const OWNERS_AND_MARKS: ReadonlyArray<{ path: string; input?: unknown; flags: Flag[] }> = [
	{ path: 'delete', input: { password: 'the owners password' }, flags: ['deleteOrganization'] },
	{ path: 'workspace.create', input: { name: 'north' }, flags: ['createWorkspace'] },
	{ path: 'workspace.remove', input: { workspaceId: 'north' }, flags: ['deleteWorkspace'] },
	{ path: 'workspace.renewCredentials', flags: ['renewCredentials'] },
	{
		path: 'member.remove',
		input: { memberId: 'member-2', lockOut: true },
		flags: ['removeMember', 'lockOut']
	},
	{ path: 'member.remove', input: { memberId: 'member-2' }, flags: ['removeMember'] },
	{
		path: 'member.offerOwnership',
		input: { memberId: 'member-2', password: 'the owners password' },
		flags: ['transferOwnership']
	},
	{ path: 'member.withdrawOffer', flags: ['transferOwnership'] },
	{ path: 'mark.set', input: { path: 'C:/seal.png' }, flags: ['manageMark'] },
	{ path: 'mark.clear', flags: ['manageMark'] }
];

/** A host whose every organization call is recorded by its path and answers nothing. */
function organizationRecording(asked: string[]): Host {
	const recording = (node: object, at: string): object =>
		Object.fromEntries(
			Object.entries(node).map(([key, value]) => [
				key,
				typeof value === 'function'
					? async () => {
							asked.push(`${at}${key}`);
						}
					: recording(value as object, `${at}${key}.`)
			])
		);

	return fakeHost({
		organization: recording(fakeHost().organization, '') as Host['organization']
	});
}

/** A procedure of the organization router, reached by its dotted path. */
function organizationAt(api: Awaited<ReturnType<typeof permittedApi>>, path: string) {
	const call = path
		.split('.')
		.reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], api.organization);

	return call as (input?: unknown) => Promise<unknown>;
}

test('an owner act or a change of the mark is refused, by name, to a caller lacking its flag, and the owner reaches the host', async () => {
	for (const { path, input, flags } of OWNERS_AND_MARKS) {
		for (const flag of flags) {
			const asked: string[] = [];
			const lacking = await permittedApi(
				organizationRecording(asked),
				...EVERY_FLAG.filter((held) => held !== flag)
			);
			const refusal = await organizationAt(
				lacking,
				path
			)(input).then(
				() => null,
				(error: unknown) => error as { code?: string; message?: string }
			);

			assert.equal(refusal?.code, 'FORBIDDEN', `${path} without ${flag}`);
			assert.equal(refusal?.message, `this account does not hold ${flag}`, path);
			assert.deepEqual(asked, [], `${path} reached the host without ${flag}`);
		}

		// the owner holds every flag, and each of these reaches the host once, as before.
		const asked: string[] = [];
		const owner = await permittedApi(organizationRecording(asked), ...EVERY_FLAG);

		await organizationAt(owner, path)(input);

		assert.equal(asked.length, 1, `the owner's ${path} reached the host ${asked.length} times`);
	}

	// and a removal that does not lock out asks nothing of the owner's.
	const asked: string[] = [];
	const remover = await permittedApi(organizationRecording(asked), 'removeMember');

	await remover.organization.member.remove({ memberId: 'member-2' });
	await assert.rejects(remover.organization.member.remove({ memberId: 'member-2', lockOut: true }));
	assert.deepEqual(asked, ['member.remove']);
});

// effort 838, requirement 6 as amended 2026-09-27: adding, editing or deleting a kind of record
// needs viewing it. A role mask, and what a role and an override give a member, that write a kind
// without viewing it are refused before the host is asked to write, naming the kind by the code
// Rust refuses it with. Rust refuses the same again, and whether a new mask leaves a holder's
// override doing so is Rust's alone.
test('a role or an override that writes a kind of record without viewing it is refused by kind', async () => {
	const asked: string[] = [];
	const host = fakeHost({
		organization: {
			...fakeHost().organization,
			roles: async () => [
				{ ...BUILT_IN.member, kind: 'member', name: '', holders: 1 },
				{ id: 'role-7', kind: 'custom', name: 'collector', mask: 0, rank: 500_000, holders: 1 }
			],
			role: {
				...fakeHost().organization.role,
				create: async (name, mask) => {
					asked.push(`create:${mask}`);

					return { id: 'role-8', kind: 'custom', name, mask, rank: 250_000, holders: 0 };
				},
				setMask: async (roleId, mask) => {
					asked.push(`setMask:${roleId}:${mask}`);

					return { id: roleId, kind: 'custom', name: 'collector', mask, rank: 0, holders: 0 };
				}
			},
			member: {
				...fakeHost().organization.member,
				list: async () => [fakeOrganizationMember({ id: 'member-2', roleId: 'member' })],
				create: async (username, roleId, override) => {
					asked.push(`create:${username}:${roleId}:${override}`);

					return fakeOrganizationMember({ username, roleId, override });
				},
				assignRole: async (memberId, roleId, override) => {
					asked.push(`assignRole:${memberId}:${roleId}:${override}`);

					return fakeOrganizationMember({ id: memberId, roleId });
				},
				setOverride: async (memberId, override) => {
					asked.push(`setOverride:${memberId}:${override}`);

					return fakeOrganizationMember({ id: memberId, override });
				}
			}
		}
	});
	const api = await permittedApi(
		host,
		'manageRoles',
		'assignRole',
		'overrideMember',
		'inviteMember',
		'grantWorkspace'
	);
	const refusedAs = async (call: Promise<unknown>, code: string): Promise<void> => {
		await assert.rejects(call, (error: unknown) => {
			assert.equal(readRefusal(error)?.code, code);

			return true;
		});
	};

	await refusedAs(
		api.organization.role.create({
			name: 'collector',
			mask: maskOf('editContract'),
			afterRoleId: 'manager'
		}),
		'host.contractNeedsViewing'
	);
	await refusedAs(
		api.organization.role.setMask({
			roleId: 'role-7',
			mask: maskOf('viewUnit', 'createTenant')
		}),
		'host.tenantNeedsViewing'
	);
	// the member's role views payments; an override switching that view off leaves them writing
	// payments they cannot see.
	await refusedAs(
		api.organization.member.setOverride({
			memberId: 'member-2',
			override: maskOf('viewPayment')
		}),
		'host.paymentNeedsViewing'
	);
	await refusedAs(
		api.organization.member.assignRole({
			memberId: 'member-2',
			roleId: 'role-7',
			override: maskOf('deleteComplex')
		}),
		'host.complexNeedsViewing'
	);
	await refusedAs(
		api.organization.member.create({
			username: 'sami.staff',
			roleId: 'member',
			override: maskOf('viewUnit'),
			workspaces: []
		}),
		'host.unitNeedsViewing'
	);
	assert.deepEqual(asked, [], 'the host was asked to write a mask the router refuses');

	// and the same acts go through where every kind written is viewed.
	await api.organization.role.create({
		name: 'collector',
		mask: maskOf('viewContract', 'editContract'),
		afterRoleId: 'manager'
	});
	await api.organization.member.setOverride({
		memberId: 'member-2',
		override: maskOf('viewPayment', 'createPayment', 'editPayment')
	});
	await api.organization.member.assignRole({ memberId: 'member-2', roleId: 'role-7' });

	assert.deepEqual(asked, [
		`create:${maskOf('viewContract', 'editContract')}`,
		`setOverride:member-2:${maskOf('viewPayment', 'createPayment', 'editPayment')}`,
		'assignRole:member-2:role-7:undefined'
	]);
});
