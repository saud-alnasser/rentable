import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

import type {
	GroupState,
	LinkShape,
	LockOutCost,
	MachineView,
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
	WorkspaceGrant,
	WorkspaceStatement
} from './host';
import type { Row } from '$lib/platform/database/client';

/** the Rust side is `LINK_ARRIVED_EVENT` in `tauri/src/organization/invitation/arrival.rs`, one name. */
const LINK_ARRIVED_EVENT = 'organization:link';
/** the Rust side is `MIGRATION_EVENT` in `tauri/src/organization/workspace/command.rs`, one name. */
const MIGRATION_EVENT = 'organization:migration';

/**
 * the organization's tauri commands: its port, satisfied by the Tauri shell.
 *
 * **Every command name and argument shape is the Rust side's.** The commands are the
 * `organization` plugin's, so each is `plugin:organization|<command>`; the arguments are spelled
 * as they were in the platform facade, where they sat until effort 840 gave the organization its
 * own port.
 */
export const tauri = {
	markGet: () => invoke<OrganizationMark | null>('plugin:organization|mark_get'),
	markSet: (path: string) => invoke<OrganizationMark>('plugin:organization|mark_set', { path }),
	markClear: () => invoke<void>('plugin:organization|mark_clear'),
	consentBegin: () => invoke<OrganizationConsentStart>('plugin:organization|setup_consent_begin'),
	consentResult: (sessionId: string) =>
		invoke<OrganizationConsentResult>('plugin:organization|setup_consent_result', { sessionId }),
	consentDisconnect: () => invoke<void>('plugin:organization|setup_consent_disconnect'),
	// `group` crosses as an explicit `null` where none was asked for, rather than being left
	// out: the command's argument is an `Option<String>` and a key that is present and null
	// is the shape that reaches it as `None` whatever the argument order.
	create: (name: string, username: string, password: string, group: string | null) =>
		invoke<OrganizationCreated>('plugin:organization|setup_create', {
			name,
			username,
			password,
			group
		}),
	groupInspect: () => invoke<GroupState>('plugin:organization|setup_group_inspect'),
	connectExisting: (username: string, password: string) =>
		invoke<OrganizationState>('plugin:organization|setup_connect_existing', { username, password }),
	getState: () => invoke<OrganizationState>('plugin:organization|session_state_get'),
	disconnect: () => invoke<OrganizationState>('plugin:organization|session_disconnect'),
	select: (organizationId: string) =>
		invoke<OrganizationState>('plugin:organization|session_select', { organizationId }),
	remove: (organizationId: string) =>
		invoke<OrganizationState>('plugin:organization|session_remove', { organizationId }),
	delete: (password: string) =>
		invoke<OrganizationState>('plugin:organization|member_organization_delete', { password }),
	signIn: (username: string, password: string) =>
		invoke<OrganizationState>('plugin:organization|session_sign_in', { username, password }),
	signOut: () => invoke<OrganizationState>('plugin:organization|session_sign_out'),
	sessionEndElsewhere: () => invoke<SessionsEnded>('plugin:organization|session_end_elsewhere'),
	machines: () => invoke<MachineView[]>('plugin:organization|session_machines'),
	endMachine: (machineId: string) =>
		invoke<SessionsEnded>('plugin:organization|session_end_machine', { machineId }),
	linkTake: () => invoke<string | null>('plugin:organization|invitation_link_take'),
	onLink: (listener: (link: string) => void) =>
		listen<string>(LINK_ARRIVED_EVENT, (event) => listener(event.payload)),
	onMigration: (listener: (notice: MigrationNotice) => void) =>
		listen<MigrationNotice>(MIGRATION_EVENT, (event) => listener(event.payload)),
	linkRead: (link: string) =>
		invoke<LinkShape>('plugin:organization|invitation_link_read', { link }),
	reconnectAuthority: () =>
		invoke<OrganizationState>('plugin:organization|setup_reconnect_authority'),
	renewDue: () => invoke<boolean>('plugin:organization|workspace_renew_due'),
	roles: () => invoke<OrganizationRole[]>('plugin:organization|role_list'),
	role: {
		create: (name: string, mask: number, afterRoleId: string) =>
			invoke<OrganizationRole>('plugin:organization|role_create', { name, mask, afterRoleId }),
		rename: (roleId: string, name: string) =>
			invoke<OrganizationRole>('plugin:organization|role_rename', { roleId, name }),
		setMask: (roleId: string, mask: number) =>
			invoke<OrganizationRole>('plugin:organization|role_set_mask', { roleId, mask }),
		move: (roleId: string, afterRoleId: string) =>
			invoke<OrganizationRole>('plugin:organization|role_move', { roleId, afterRoleId }),
		remove: (roleId: string) => invoke<void>('plugin:organization|role_delete', { roleId })
	},
	workspace: {
		create: (name: string) =>
			invoke<OrganizationWorkspace>('plugin:organization|workspace_create', { name }),
		open: (workspaceId: string) =>
			invoke<OrganizationWorkspace>('plugin:organization|workspace_open', { workspaceId }),
		grant: (workspaceId: string, memberId: string, access: 'full-access' | 'read-only') =>
			invoke<void>('plugin:organization|workspace_grant', { workspaceId, memberId, access }),
		withdraw: (workspaceId: string, memberId: string) =>
			invoke<void>('plugin:organization|workspace_grant_withdraw', { workspaceId, memberId }),
		remove: (workspaceId: string) =>
			invoke<void>('plugin:organization|workspace_delete', { workspaceId }),
		renewCredentials: () => invoke<number>('plugin:organization|workspace_renew_credentials'),
		query: (workspaceId: string, query: WorkspaceStatement) =>
			invoke<Row[]>('plugin:organization|workspace_query', { workspaceId, query }),
		batch: (workspaceId: string, queries: WorkspaceStatement[]) =>
			invoke<Row[][]>('plugin:organization|workspace_batch', { workspaceId, queries })
	},
	member: {
		list: () => invoke<OrganizationMember[]>('plugin:organization|member_list'),
		standings: () => invoke<MemberStanding[]>('plugin:organization|member_standings'),
		// the override crosses as `overrideMask`, since Rust keeps `override` as a word of its own.
		create: (username: string, roleId: string, override: number, workspaces: WorkspaceGrant[]) =>
			invoke<OrganizationMember>('plugin:organization|invitation_member_create', {
				username,
				roleId,
				overrideMask: override,
				workspaces
			}),
		linkMake: (memberId: string, lifetimeHours: number) =>
			invoke<MadeLink>('plugin:organization|invitation_link_make', { memberId, lifetimeHours }),
		unsetPassword: (memberId: string) =>
			invoke<UnreachableWorkspace[]>('plugin:organization|invitation_password_unset', { memberId }),
		remove: (memberId: string, lockOut: boolean) =>
			invoke<MemberRemoved>('plugin:organization|member_remove', { memberId, lockOut }),
		lockOutCost: (memberId: string) =>
			invoke<LockOutCost>('plugin:organization|member_lock_out_cost', { memberId }),
		rename: (memberId: string, username: string) =>
			invoke<OrganizationMember>('plugin:organization|member_rename', { memberId, username }),
		assignRole: (memberId: string, roleId: string, override?: number) =>
			invoke<OrganizationMember>('plugin:organization|role_assign', {
				memberId,
				roleId,
				overrideMask: override ?? null
			}),
		setOverride: (memberId: string, override: number) =>
			invoke<OrganizationMember>('plugin:organization|role_set_override', {
				memberId,
				overrideMask: override
			}),
		setWorkspaceOverride: (
			memberId: string,
			workspaceId: string,
			pinned: number,
			granted: number
		) =>
			invoke<OrganizationMember>('plugin:organization|role_set_workspace_override', {
				memberId,
				workspaceId,
				pinned,
				granted
			}),
		offerOwnership: (memberId: string, password: string) =>
			invoke<OrganizationMember>('plugin:organization|ownership_offer', { memberId, password }),
		withdrawOffer: () => invoke<void>('plugin:organization|ownership_withdraw_offer'),
		endSessions: (memberId: string) =>
			invoke<SessionsEnded>('plugin:organization|member_end_sessions', { memberId }),
		unlock: (memberId: string) => invoke<void>('plugin:organization|member_unlock', { memberId })
	},
	invitation: {
		accept: (link: string, code: string, password: string) =>
			invoke<OrganizationState>('plugin:organization|invitation_accept', { link, code, password })
	},
	machineConnect: (link: string, code: string) =>
		invoke<OrganizationState>('plugin:organization|invitation_machine_connect', { link, code }),
	changePassword: (current: string, next: string) =>
		invoke<OrganizationState>('plugin:organization|member_change_password', { current, new: next }),
	ownershipAccept: (password: string) =>
		invoke<OrganizationState>('plugin:organization|ownership_accept', { password }),
	accountRefusalDetail: () =>
		invoke<string | null>('plugin:organization|setup_account_refusal_detail')
} satisfies OrganizationHost;
