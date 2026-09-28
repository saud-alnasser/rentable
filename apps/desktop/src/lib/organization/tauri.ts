import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

import type {
	GroupState,
	LinkShape,
	LockOutCost,
	MadeLink,
	MemberRemoved,
	MemberStanding,
	MigrationNotice,
	OrganizationConsentResult,
	OrganizationConsentStart,
	OrganizationCreated,
	OrganizationHost,
	OrganizationMark,
	OrganizationMember,
	OrganizationRole,
	OrganizationState,
	OrganizationWorkspace,
	SessionsEnded,
	UnreachableWorkspace,
	WorkspaceGrant
} from './host';

/** the Rust side is `LINK_ARRIVED_EVENT` in `tauri/src/lib.rs`, and the two are one name. */
const LINK_ARRIVED_EVENT = 'organization:link';
/** the Rust side is `MIGRATION_EVENT` in `tauri/src/organization/workspace/command.rs`, one name. */
const MIGRATION_EVENT = 'organization:migration';

/**
 * the organization's tauri commands: its port, satisfied by the Tauri shell.
 *
 * **Every command name and argument shape is the Rust side's**, and they are spelled here exactly
 * as they were in the platform facade, where they sat until effort 840 gave the organization its
 * own port.
 */
export const tauri = {
	markGet: () => invoke<OrganizationMark | null>('organization_mark_get'),
	markSet: (path: string) => invoke<OrganizationMark>('organization_mark_set', { path }),
	markClear: () => invoke<void>('organization_mark_clear'),
	consentBegin: () => invoke<OrganizationConsentStart>('organization_consent_begin'),
	consentResult: (sessionId: string) =>
		invoke<OrganizationConsentResult>('organization_consent_result', { sessionId }),
	consentDisconnect: () => invoke<void>('organization_consent_disconnect'),
	// `group` crosses as an explicit `null` where none was asked for, rather than being left
	// out: the command's argument is an `Option<String>` and a key that is present and null
	// is the shape that reaches it as `None` whatever the argument order.
	create: (name: string, username: string, password: string, group: string | null) =>
		invoke<OrganizationCreated>('organization_create', { name, username, password, group }),
	groupInspect: () => invoke<GroupState>('organization_group_inspect'),
	connectExisting: (username: string, password: string) =>
		invoke<OrganizationState>('organization_connect_existing', { username, password }),
	getState: () => invoke<OrganizationState>('organization_state_get'),
	disconnect: () => invoke<OrganizationState>('organization_disconnect'),
	delete: (password: string) => invoke<OrganizationState>('organization_delete', { password }),
	signIn: (username: string, password: string) =>
		invoke<OrganizationState>('organization_sign_in', { username, password }),
	signOut: () => invoke<OrganizationState>('organization_sign_out'),
	sessionEndElsewhere: () => invoke<SessionsEnded>('organization_session_end_elsewhere'),
	linkTake: () => invoke<string | null>('organization_link_take'),
	onLink: (listener: (link: string) => void) =>
		listen<string>(LINK_ARRIVED_EVENT, (event) => listener(event.payload)),
	onMigration: (listener: (notice: MigrationNotice) => void) =>
		listen<MigrationNotice>(MIGRATION_EVENT, (event) => listener(event.payload)),
	linkRead: (link: string) => invoke<LinkShape>('organization_link_read', { link }),
	reconnectAuthority: () => invoke<OrganizationState>('organization_reconnect_authority'),
	renewDue: () => invoke<boolean>('organization_renew_due'),
	roles: () => invoke<OrganizationRole[]>('organization_roles'),
	role: {
		create: (name: string, mask: number, afterRoleId: string) =>
			invoke<OrganizationRole>('role_create', { name, mask, afterRoleId }),
		rename: (roleId: string, name: string) =>
			invoke<OrganizationRole>('role_rename', { roleId, name }),
		setMask: (roleId: string, mask: number) =>
			invoke<OrganizationRole>('role_set_mask', { roleId, mask }),
		move: (roleId: string, afterRoleId: string) =>
			invoke<OrganizationRole>('role_move', { roleId, afterRoleId }),
		remove: (roleId: string) => invoke<void>('role_delete', { roleId })
	},
	workspace: {
		create: (name: string) => invoke<OrganizationWorkspace>('workspace_create', { name }),
		open: (workspaceId: string) => invoke<OrganizationWorkspace>('workspace_open', { workspaceId }),
		grant: (workspaceId: string, memberId: string, access: 'full-access' | 'read-only') =>
			invoke<void>('workspace_grant', { workspaceId, memberId, access }),
		withdraw: (workspaceId: string, memberId: string) =>
			invoke<void>('workspace_grant_withdraw', { workspaceId, memberId }),
		remove: (workspaceId: string) => invoke<void>('workspace_delete', { workspaceId }),
		renewCredentials: () => invoke<number>('organization_renew_credentials')
	},
	member: {
		list: () => invoke<OrganizationMember[]>('organization_members'),
		standings: () => invoke<MemberStanding[]>('organization_member_standings'),
		// the override crosses as `overrideMask`, since Rust keeps `override` as a word of its own.
		create: (username: string, roleId: string, override: number, workspaces: WorkspaceGrant[]) =>
			invoke<OrganizationMember>('member_create', {
				username,
				roleId,
				overrideMask: override,
				workspaces
			}),
		linkMake: (memberId: string) => invoke<MadeLink>('member_link_make', { memberId }),
		unsetPassword: (memberId: string) =>
			invoke<UnreachableWorkspace[]>('member_password_unset', { memberId }),
		remove: (memberId: string, lockOut: boolean) =>
			invoke<MemberRemoved>('member_remove', { memberId, lockOut }),
		lockOutCost: (memberId: string) => invoke<LockOutCost>('member_lock_out_cost', { memberId }),
		rename: (memberId: string, username: string) =>
			invoke<OrganizationMember>('member_rename', { memberId, username }),
		assignRole: (memberId: string, roleId: string, override?: number) =>
			invoke<OrganizationMember>('member_assign_role', {
				memberId,
				roleId,
				overrideMask: override ?? null
			}),
		setOverride: (memberId: string, override: number) =>
			invoke<OrganizationMember>('member_set_override', { memberId, overrideMask: override }),
		setWorkspaceOverride: (
			memberId: string,
			workspaceId: string,
			pinned: number,
			granted: number
		) =>
			invoke<OrganizationMember>('member_set_workspace_override', {
				memberId,
				workspaceId,
				pinned,
				granted
			}),
		offerOwnership: (memberId: string, password: string) =>
			invoke<OrganizationMember>('member_offer_ownership', { memberId, password }),
		withdrawOffer: () => invoke<void>('member_withdraw_offer'),
		endSessions: (memberId: string) => invoke<SessionsEnded>('member_end_sessions', { memberId })
	},
	invitation: {
		accept: (link: string, code: string, password: string) =>
			invoke<OrganizationState>('invitation_accept', { link, code, password })
	},
	machineConnect: (link: string, code: string) =>
		invoke<OrganizationState>('machine_connect', { link, code }),
	changePassword: (current: string, next: string) =>
		invoke<OrganizationState>('organization_change_password', { current, new: next }),
	ownershipAccept: (password: string) =>
		invoke<OrganizationState>('ownership_accept', { password }),
	accountRefusalDetail: () => invoke<string | null>('organization_account_refusal_detail')
} satisfies OrganizationHost;
