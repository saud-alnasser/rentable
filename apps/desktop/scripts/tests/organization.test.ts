import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
	GRANTS,
	MEMBERS,
	ROLE_NAMES,
	Refusal,
	Unreachable,
	WORKSPACE_NAMES,
	connectOverDebugPort,
	roleMask,
	runOrganizationSeed,
	seedOrganization,
	type Invoke
} from '../organization.ts';

/**
 * Ticket 54 of effort 846, criterion 1: the organization seed's plan, with the running app's
 * `invoke` stood in for. It chains the roles from the manager, makes the members in their roles
 * with their grants, makes the workspaces and grants members into them, skips what is already
 * there, and resolves on an app that is closed or signed out, so the records seed beside it still
 * runs.
 */

const MEMBER_MASK = 513104936960;
const MANAGER_MASK = 1099510580223;

type Call = { name: string; args: Record<string, unknown> };

/** a fake app holding the presets, `roles` and `members` already, and the owner signed in. */
function fakeApp(
	options: {
		signedIn?: boolean;
		roles?: string[];
		members?: string[];
		workspaces?: { id: string; name: string }[];
		notOwnerMachine?: boolean;
	} = {}
) {
	type Grant = { id: string; access: string };
	type Row = { id: string; username: string; roleId: string; workspaces: Grant[] };
	const calls: Call[] = [];
	const roles = [
		{ id: 'owner', kind: 'owner', name: '', mask: MANAGER_MASK, rank: 100 },
		{ id: 'manager', kind: 'manager', name: '', mask: MANAGER_MASK, rank: 90 },
		...(options.roles ?? []).map((name, index) => ({
			id: `existing-${index}`,
			kind: 'custom',
			name,
			mask: MEMBER_MASK,
			rank: 50
		})),
		{ id: 'member', kind: 'member', name: '', mask: MEMBER_MASK, rank: 0 }
	];
	const workspaces = [...(options.workspaces ?? [{ id: 'ws-1', name: 'Main' }])];
	const members: Row[] = [
		{ id: 'm-owner', username: 'owner', roleId: 'owner', workspaces: [] },
		...(options.members ?? []).map((username, index) => ({
			id: `m-${index}`,
			username,
			roleId: 'member',
			workspaces: []
		}))
	];
	let made = 0;

	const invoke: Invoke = async (name, args = {}) => {
		calls.push({ name, args });

		switch (name) {
			case 'session_state_get':
				return {
					session:
						options.signedIn === false
							? null
							: {
									username: 'owner',
									workspaces: [...workspaces]
								}
				};
			case 'role_list':
				return roles;
			case 'member_list':
				return members;
			case 'role_create': {
				const role = {
					id: `made-${made++}`,
					kind: 'custom',
					name: args.name as string,
					mask: args.mask as number,
					rank: 0
				};

				roles.push(role);

				return role;
			}
			case 'invitation_member_create':
				members.push({
					id: `m-new-${made++}`,
					username: args.username as string,
					roleId: args.roleId as string,
					workspaces: [...(args.workspaces as Grant[])]
				});

				return members.at(-1);
			case 'workspace_create': {
				if (options.notOwnerMachine) {
					throw new Refusal('only an owner can create a workspace', 'ownerMachineOnly');
				}

				const workspace = { id: `ws-made-${made++}`, name: args.name as string };

				workspaces.push(workspace);

				return workspace;
			}
			case 'workspace_grant':
				members
					.find((row) => row.id === args.memberId)
					?.workspaces.push({ id: args.workspaceId as string, access: args.access as string });

				return null;
			default:
				throw new Error(`command ${name} not found`);
		}
	};

	return { invoke, calls };
}

const quiet = () => {};

test('a dozen roles are made, each placed below the one made before it, from the manager down', async () => {
	const app = fakeApp();

	const outcome = await seedOrganization(app.invoke, { log: quiet });

	const creates = app.calls.filter((call) => call.name === 'role_create');

	assert.equal(creates.length, 12);
	assert.deepEqual(
		creates.map((call) => call.args.name),
		[...ROLE_NAMES]
	);
	assert.deepEqual(
		creates.map((call) => call.args.afterRoleId),
		['manager', ...creates.slice(0, -1).map((_, index) => `made-${index}`)]
	);
	assert.deepEqual(outcome, {
		status: 'seeded',
		rolesCreated: 12,
		membersCreated: 30,
		workspacesCreated: 12,
		grantsMade: GRANTS.length,
		failures: []
	});
});

test('every custom role carries the member preset and part, never all, of what only the manager adds', () => {
	const member = BigInt(MEMBER_MASK);
	const extra = BigInt(MANAGER_MASK) & ~member;

	for (let place = 0; place < ROLE_NAMES.length; place++) {
		const mask = BigInt(roleMask(MEMBER_MASK, MANAGER_MASK, place));
		const added = mask & ~member;

		assert.equal(mask & member, member, `role ${place} keeps the member's flags`);
		assert.equal(added & ~extra, 0n, `role ${place} takes nothing the manager lacks`);
		assert.ok(added !== 0n && added !== extra, `role ${place} stands strictly between`);
		assert.ok(Number.isSafeInteger(Number(mask)), 'the mask crosses as an exact Number');
	}
});

test('members are made in their roles, some with full or read-only grants and some with none', async () => {
	const app = fakeApp();

	await seedOrganization(app.invoke, { workspaceId: 'ws-2', log: quiet });

	const creates = app.calls.filter((call) => call.name === 'invitation_member_create');
	const roleOf = new Map(
		app.calls
			.filter((call) => call.name === 'role_create')
			.map((call, index) => [call.args.name, `made-${index}`])
	);

	assert.equal(creates.length, MEMBERS.length);

	for (const [index, planned] of MEMBERS.entries()) {
		const args = creates[index].args;
		const expectedRole =
			typeof planned.role === 'number' ? roleOf.get(ROLE_NAMES[planned.role]) : planned.role;

		assert.equal(args.username, planned.username);
		assert.equal(args.roleId, expectedRole);
		assert.equal(args.overrideMask, 0);
		// ws-2 is not one the session holds, so the first it holds is granted
		assert.deepEqual(
			args.workspaces,
			planned.access ? [{ id: 'ws-1', access: planned.access }] : []
		);
	}

	const roles = new Set(creates.map((call) => call.args.roleId));

	assert.ok(roles.has('manager') && roles.has('member'), 'the presets hold members');
	assert.ok(roles.size >= 12, 'custom roles hold members too');

	const accesses = new Set(creates.map((call) => JSON.stringify(call.args.workspaces)));

	assert.equal(accesses.size, 3, 'full access, read only, and no grant all occur');
});

test('the current workspace is the one granted where the session holds it', async () => {
	const app = fakeApp({
		workspaces: [
			{ id: 'ws-1', name: 'Main' },
			{ id: 'ws-2', name: 'Second' }
		]
	});

	await seedOrganization(app.invoke, { workspaceId: 'ws-2', log: quiet });

	const granted = app.calls
		.filter((call) => call.name === 'invitation_member_create')
		.flatMap((call) => call.args.workspaces as { id: string }[]);

	assert.ok(granted.length > 0);
	assert.ok(granted.every((grant) => grant.id === 'ws-2'));
});

test('role names and usernames already there are skipped, compared without case', async () => {
	const app = fakeApp({
		roles: ['accountant', 'Collector'],
		members: ['AISHA.RAHMAN', 'omar.khalid']
	});

	const outcome = await seedOrganization(app.invoke, { log: quiet });

	const roleCreates = app.calls.filter((call) => call.name === 'role_create');
	const memberCreates = app.calls.filter((call) => call.name === 'invitation_member_create');

	assert.equal(roleCreates.length, 10);
	assert.ok(
		!roleCreates.some((call) => ['Accountant', 'Collector'].includes(String(call.args.name)))
	);
	// the chain runs through a role already there rather than around it
	const afterAccountant = roleCreates.find((call) => call.args.name === 'Bookkeeper');

	assert.equal(afterAccountant?.args.afterRoleId, 'existing-0');
	assert.equal(memberCreates.length, 28);
	assert.ok(outcome.status === 'seeded' && outcome.membersCreated === 28);
});

test('a second run makes nothing new and says so', async () => {
	const app = fakeApp();
	const lines: string[] = [];

	await runOrganizationSeed(async () => ({ invoke: app.invoke, close: quiet }), { log: quiet });
	const second = await runOrganizationSeed(async () => ({ invoke: app.invoke, close: quiet }), {
		log: (line) => lines.push(line)
	});

	assert.deepEqual(second, {
		status: 'seeded',
		rolesCreated: 0,
		membersCreated: 0,
		workspacesCreated: 0,
		grantsMade: 0,
		failures: []
	});

	const writes = ['role_create', 'invitation_member_create', 'workspace_create', 'workspace_grant'];

	assert.equal(
		app.calls.filter((call) => writes.includes(call.name)).length,
		12 + 30 + 12 + GRANTS.length,
		'every write was the first run'
	);
	assert.match(lines.join('\n'), /nothing new was made/);
});

test('the workspaces come after the members, and a few members are granted into each', async () => {
	const app = fakeApp();

	await seedOrganization(app.invoke, { log: quiet });

	const names = app.calls.map((call) => call.name);
	const creates = app.calls.filter((call) => call.name === 'workspace_create');

	assert.deepEqual(
		creates.map((call) => call.args.name),
		[...WORKSPACE_NAMES]
	);
	assert.ok(
		names.lastIndexOf('role_create') < names.indexOf('invitation_member_create') &&
			names.lastIndexOf('invitation_member_create') < names.indexOf('workspace_create') &&
			names.lastIndexOf('workspace_create') < names.indexOf('workspace_grant'),
		'roles, members, workspaces, grants, in that order'
	);

	const grants = app.calls.filter((call) => call.name === 'workspace_grant');
	const perWorkspace = new Map<unknown, unknown[]>();

	for (const grant of grants) {
		perWorkspace.set(grant.args.workspaceId, [
			...(perWorkspace.get(grant.args.workspaceId) ?? []),
			grant.args.access
		]);
	}

	assert.equal(perWorkspace.size, WORKSPACE_NAMES.length - 1, 'one workspace is left with nobody');
	assert.ok([...perWorkspace.values()].every((accesses) => accesses.length >= 2));
	assert.ok(grants.some((grant) => grant.args.access === 'read-only'));
	assert.ok(grants.some((grant) => grant.args.access === 'full-access'));
});

test('workspaces and grants already there are skipped', async () => {
	const app = fakeApp({
		workspaces: [
			{ id: 'ws-1', name: 'Main' },
			{ id: 'ws-olaya', name: 'olaya towers' }
		]
	});

	await seedOrganization(app.invoke, { log: quiet });

	const creates = app.calls.filter((call) => call.name === 'workspace_create');

	assert.equal(creates.length, WORKSPACE_NAMES.length - 1);
	assert.ok(!creates.some((call) => call.args.name === 'Olaya Towers'));
	assert.ok(
		app.calls.some(
			(call) => call.name === 'workspace_grant' && call.args.workspaceId === 'ws-olaya'
		),
		'a workspace already there still has its members granted'
	);

	const second = await seedOrganization(app.invoke, { log: quiet });

	assert.ok(
		second.status === 'seeded' && second.grantsMade === 0,
		'a grant held is not made again'
	);
});

test('a machine that is not the owner says so once and seeds the rest', async () => {
	const app = fakeApp({ notOwnerMachine: true });

	const outcome = await seedOrganization(app.invoke, { log: quiet });

	assert.ok(outcome.status === 'seeded');
	assert.equal(outcome.workspacesCreated, 0);
	assert.equal(outcome.membersCreated, 30);
	assert.equal(app.calls.filter((call) => call.name === 'workspace_create').length, 1);
	assert.deepEqual(outcome.failures, ['workspaces: only an owner can create a workspace']);
});

test('the output says each workspace is a hosted database', async () => {
	const app = fakeApp();
	const lines: string[] = [];

	await runOrganizationSeed(async () => ({ invoke: app.invoke, close: quiet }), {
		log: (line) => lines.push(line)
	});

	assert.ok(
		lines.includes("making workspace Olaya Towers, a hosted database on the owner's Turso account")
	);
	assert.match(lines.at(-1) ?? '', /each a hosted database/);
});

test('a refusal is reported and the rest are still made', async () => {
	const app = fakeApp();
	const invoke: Invoke = async (name, args) => {
		if (name === 'invitation_member_create' && args?.username === 'layla.hassan') {
			throw new Error('that username is already taken in this organization');
		}

		return app.invoke(name, args);
	};

	const outcome = await seedOrganization(invoke, { log: quiet });

	assert.ok(outcome.status === 'seeded');
	assert.equal(outcome.membersCreated, 29);
	assert.deepEqual(outcome.failures, [
		'member layla.hassan: that username is already taken in this organization'
	]);
});

test('a signed-out app is said plainly and nothing is written', async () => {
	const app = fakeApp({ signedIn: false });
	const lines: string[] = [];

	const outcome = await runOrganizationSeed(async () => ({ invoke: app.invoke, close: quiet }), {
		log: (line) => lines.push(line)
	});

	assert.equal(outcome.status, 'skipped');
	assert.deepEqual(
		app.calls.map((call) => call.name),
		['session_state_get']
	);
	assert.match(lines.join('\n'), /nobody is signed in/);
});

test('an app that does not answer is said plainly and the run resolves rather than failing', async () => {
	const lines: string[] = [];

	const outcome = await runOrganizationSeed(
		async () => {
			throw new Unreachable('no app answered on debugging port 9222');
		},
		{ log: (line) => lines.push(line) }
	);

	assert.equal(outcome.status, 'skipped');
	assert.deepEqual(lines, ['no app answered on debugging port 9222']);
});

test('an unexpected failure inside the app is reported and still resolves', async () => {
	const lines: string[] = [];

	const outcome = await runOrganizationSeed(
		async () => ({
			invoke: async () => {
				throw new Error('Cannot read properties of undefined');
			},
			close: quiet
		}),
		{ log: (line) => lines.push(line) }
	);

	assert.equal(outcome.status, 'skipped');
	assert.match(lines[0], /not seeded: Cannot read properties of undefined/);
});

test('a webview with no debugging port is said plainly on macOS and Linux', async () => {
	for (const platform of ['darwin', 'linux'] as const) {
		await assert.rejects(connectOverDebugPort(9222, platform)(), (error: unknown) => {
			assert.ok(error instanceof Unreachable);
			assert.match(error.message, new RegExp(`webview on ${platform} opens no debugging port`));

			return true;
		});
	}
});

test('nothing listening on the port is unreachable, not a crash', async () => {
	// port 9 (discard) is closed on a development machine, so the fetch is refused at once
	await assert.rejects(connectOverDebugPort(9, 'win32')(), Unreachable);
});
