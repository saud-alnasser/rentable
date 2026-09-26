// Shared fixtures for the desktop shell's port: a host implementing the whole of it, and the
// payloads it speaks in. Not a `*.test.ts` file, so the test runner does not pick it up
// directly.
//
// They live here rather than beside each caller because the port is one declaration and its
// payloads have no optional fields: a fixture holding the two members a subject happens to read
// is a shape the shell never produces, and every test that wrote one out by hand wrote a
// different one.

import { BUILT_IN } from '@rentable/workspace-permission';

import type {
	HeldOrganization,
	OrganizationMember,
	OrganizationRole,
	OrganizationSession,
	OrganizationState,
	OrganizationWorkspace,
	Host,
	RemoteSyncState,
	RemoteSyncWorkspace,
	Settings
} from '$lib/platform/host.ts';

/** The settings a fake shell reports, with only what a test cares about spelled out. */
export function fakeSettings(overrides: Partial<Settings> = {}): Settings {
	return {
		endingSoonNoticeDays: 60,
		databasePath: 'C:/rentable/app.db',
		diagnosticsDir: 'C:/rentable/diagnostics',
		locale: 'en',
		appearance: 'system',
		version: '0.0.0-test',
		...overrides
	};
}

/** A workspace as the store holds one. */
export function fakeWorkspace(overrides: Partial<RemoteSyncWorkspace> = {}): RemoteSyncWorkspace {
	return {
		remoteId: null,
		id: 'workspace',
		name: 'Workspace',
		localDatabasePath: 'C:/rentable/app.db',
		permissions: 0,
		lastError: null,
		createdAt: 0,
		updatedAt: 0,
		...overrides
	};
}

/** What `remoteSync.getState` answers with. */
export function fakeSyncState(overrides: Partial<RemoteSyncState> = {}): RemoteSyncState {
	return {
		workspace: fakeWorkspace(),
		startupPromptEnabled: false,
		deviceId: 'device',
		accountRefusal: null,
		credentialRefusal: null,
		lastReachedAt: null,
		...overrides
	};
}

function refuse(capability: string): () => never {
	return () => {
		throw new Error(`the fake host was asked for ${capability}, which this test did not supply`);
	};
}

/**
 * A host implementing the whole port, so a fixture satisfies the interface a subject is handed
 * rather than the corner of it that subject happens to read.
 *
 * Every capability a test does not supply refuses by name. That is what the partial object
 * literals here did already — reaching one of them threw a `TypeError` about `undefined` —
 * except that this one says which capability was wanted, and the compiler can see the whole
 * surface rather than the two members that happened to be written out.
 *
 * `overrides` replaces a capability whole, never a member of one: a half-supplied `settings` is
 * the same hole this exists to close.
 */
export function fakeHost(overrides: Partial<Host> = {}): Host {
	const settings = fakeSettings();

	return {
		bootstrap: refuse('bootstrap'),
		window: {
			show: refuse('window.show'),
			hide: refuse('window.hide'),
			minimize: refuse('window.minimize'),
			maximize: refuse('window.maximize'),
			drag: refuse('window.drag'),
			close: refuse('window.close'),
			restart: refuse('window.restart')
		},
		opener: {
			openUrl: refuse('opener.openUrl'),
			revealItemInDir: refuse('opener.revealItemInDir')
		},
		print: {
			page: refuse('print.page')
		},
		export: {
			write: refuse('export.write'),
			writeWorkbook: refuse('export.writeWorkbook')
		},
		import: {
			read: refuse('import.read'),
			readBook: refuse('import.readBook')
		},
		dialog: {
			openFile: refuse('dialog.openFile'),
			openImage: refuse('dialog.openImage'),
			saveFile: refuse('dialog.saveFile')
		},
		diagnostics: {
			write: refuse('diagnostics.write')
		},
		update: {
			prepare: refuse('update.prepare'),
			check: refuse('update.check')
		},
		settings: {
			get: async () => settings,
			// what the shell does with a changeset: a member it names is written, and one it leaves
			// out keeps what it was.
			set: async (changeset) => {
				for (const [key, value] of Object.entries(changeset)) {
					if (value !== undefined) Object.assign(settings, { [key]: value });
				}

				return settings;
			}
		},
		organization: {
			markGet: refuse('organization.markGet'),
			markSet: refuse('organization.markSet'),
			markClear: refuse('organization.markClear'),
			consentBegin: refuse('organization.consentBegin'),
			consentResult: refuse('organization.consentResult'),
			consentDisconnect: refuse('organization.consentDisconnect'),
			create: refuse('organization.create'),
			groupInspect: refuse('organization.groupInspect'),
			connectExisting: refuse('organization.connectExisting'),
			getState: refuse('organization.getState'),
			disconnect: refuse('organization.disconnect'),
			delete: refuse('organization.delete'),
			signIn: refuse('organization.signIn'),
			signOut: refuse('organization.signOut'),
			sessionEndElsewhere: refuse('organization.sessionEndElsewhere'),
			linkTake: refuse('organization.linkTake'),
			onLink: refuse('organization.onLink'),
			onMigration: refuse('organization.onMigration'),
			linkRead: refuse('organization.linkRead'),
			reconnectAuthority: refuse('organization.reconnectAuthority'),
			renewDue: refuse('organization.renewDue'),
			roles: refuse('organization.roles'),
			role: {
				create: refuse('organization.role.create'),
				rename: refuse('organization.role.rename'),
				setMask: refuse('organization.role.setMask'),
				move: refuse('organization.role.move'),
				remove: refuse('organization.role.remove')
			},
			workspace: {
				create: refuse('organization.workspace.create'),
				open: refuse('organization.workspace.open'),
				grant: refuse('organization.workspace.grant'),
				withdraw: refuse('organization.workspace.withdraw'),
				remove: refuse('organization.workspace.remove'),
				renewCredentials: refuse('organization.workspace.renewCredentials')
			},
			member: {
				list: refuse('organization.member.list'),
				standings: refuse('organization.member.standings'),
				create: refuse('organization.member.create'),
				linkMake: refuse('organization.member.linkMake'),
				unsetPassword: refuse('organization.member.unsetPassword'),
				remove: refuse('organization.member.remove'),
				lockOutCost: refuse('organization.member.lockOutCost'),
				rename: refuse('organization.member.rename'),
				assignRole: refuse('organization.member.assignRole'),
				setOverride: refuse('organization.member.setOverride'),
				offerOwnership: refuse('organization.member.offerOwnership'),
				withdrawOffer: refuse('organization.member.withdrawOffer'),
				endSessions: refuse('organization.member.endSessions')
			},
			invitation: {
				accept: refuse('organization.invitation.accept')
			},
			machineConnect: refuse('organization.machineConnect'),
			changePassword: refuse('organization.changePassword'),
			ownershipAccept: refuse('organization.ownershipAccept'),
			accountRefusalDetail: refuse('organization.accountRefusalDetail')
		},
		remoteSync: {
			getState: refuse('remoteSync.getState'),
			replicate: refuse('remoteSync.replicate'),
			push: refuse('remoteSync.push'),
			renameWorkspace: refuse('remoteSync.renameWorkspace')
		},
		...overrides
	};
}

/** the organization this machine holds, as the wall names it, with its member found. */
export function fakeHeldOrganization(overrides: Partial<HeldOrganization> = {}): HeldOrganization {
	return {
		id: 'acme',
		name: 'Acme Rentals',
		memberId: 'member-owner',
		role: 'owner',
		joinedAt: 0,
		...overrides
	};
}

/** a workspace a signed-in member holds a grant on. */
export function fakeOrganizationWorkspace(
	overrides: Partial<OrganizationWorkspace> = {}
): OrganizationWorkspace {
	return {
		id: 'north',
		name: 'North Properties',
		databaseName: 'ws-north',
		databaseHostname: 'ws-north-acme.aws-eu-west-1.turso.io',
		schemaVersion: 5,
		accessLevel: 'full-access',
		...overrides
	};
}

/** the member whose password opened a vault, with one workspace unless a test says otherwise. */
export function fakeOrganizationSession(
	overrides: Partial<OrganizationSession> = {}
): OrganizationSession {
	return {
		organizationId: 'acme',
		organizationName: 'Acme Rentals',
		memberId: 'member-owner',
		username: 'person.example',
		role: 'owner',
		roleId: 'owner',
		roleName: '',
		rank: 2_000_000,
		override: 0,
		permissions: 0,
		workspaces: [fakeOrganizationWorkspace()],
		ownerUsername: 'olivia.owner',
		ownershipOffered: false,
		...overrides
	};
}

/**
 * one member as the members list draws them: a member holding the member role, in nothing, unless
 * a test says otherwise.
 *
 * **The role's id and rank follow the kind a test names**, so a test that says `role: 'manager'`
 * gets the manager's id and rank with it rather than a member's rank under a manager's name. A
 * custom role takes a rank between the member's and the manager's, and a test about one names its
 * id and name.
 */
export function fakeOrganizationMember(
	overrides: Partial<OrganizationMember> = {}
): OrganizationMember {
	const kind = overrides.role ?? 'member';
	const builtIn = kind === 'custom' ? null : BUILT_IN[kind];

	return {
		id: 'm',
		username: 'member',
		role: kind,
		roleId: builtIn?.id ?? 'custom-role',
		roleName: '',
		rank: builtIn?.rank ?? 500_000,
		override: 0,
		permissions: 0,
		workspaces: [],
		createdAt: 0,
		offeredOwnership: false,
		...overrides
	};
}

/**
 * one role as the organization section lists it: a custom role carrying what a member does, ranked
 * between the member and the manager, unless a test says otherwise.
 */
export function fakeOrganizationRole(
	overrides: Partial<OrganizationRole> & { id: string }
): OrganizationRole {
	return {
		kind: 'custom',
		name: overrides.id,
		mask: BUILT_IN.member.mask,
		rank: 500_000,
		holders: 0,
		...overrides
	};
}

/**
 * the roles an organization lists, highest first: the three every organization has, with a
 * supervisor and a collector it made between the manager and the member.
 */
export function fakeOrganizationRoles(): OrganizationRole[] {
	return [
		fakeOrganizationRole({ ...BUILT_IN.owner, kind: 'owner', name: '', holders: 1 }),
		fakeOrganizationRole({ ...BUILT_IN.manager, kind: 'manager', name: '', holders: 1 }),
		fakeOrganizationRole({ id: 'supervisor', rank: 750_000 }),
		fakeOrganizationRole({ id: 'collector', rank: 250_000, holders: 2 }),
		fakeOrganizationRole({ ...BUILT_IN.member, kind: 'member', name: '', holders: 3 })
	];
}

/**
 * where a machine stands with its organization. The default is a machine that holds one and
 * whose person is signed in to it, because that is what most paths behind the wall want; a test
 * about the wall itself says which side of it the machine is on.
 */
export function fakeOrganizationState(
	overrides: Partial<OrganizationState> = {}
): OrganizationState {
	return {
		organization: fakeHeldOrganization(),
		session: fakeOrganizationSession(),
		holdsTursoAuthority: true,
		signedOutElsewhere: false,
		...overrides
	};
}
