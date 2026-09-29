/**
 * THE ROLES' PART OF THE ORGANIZATION HOST
 *
 * what the organization asks of the shell about its roles, and the role it speaks in. Composed into
 * the organization's port, `OrganizationHost` in `../host.ts`, which re-exports these types;
 * `../tauri.ts` is the adapter for the whole port.
 *
 * Nothing in this file imports a `@tauri-apps` package, for the reason `$lib/platform/host` gives.
 */

import type { RoleKind } from '@rentable/workspace-permission';

/**
 * one role as the settings area lists it (effort 838, requirement 12): the owner's, then every
 * role row, highest rank first. No certificate crosses with it.
 */
export type OrganizationRole = {
	id: string;
	kind: RoleKind;
	/** a custom role's name; empty on the three built-in roles, which the interface names. */
	name: string;
	/** what the role carries, as one number. Never read as a number: `permits` answers for it. */
	mask: number;
	/** how high the role stands. A custom role stands strictly between the member and the manager. */
	rank: number;
	/** how many members still in hold it. */
	holders: number;
};

/**
 * the organization's own roles (effort 838, requirement 4). Each is `manageRoles`'s, on a role
 * ranked below the caller's, and a mask may carry only flags the caller holds and none of the
 * owner's; Rust refuses each by name. What comes back is the role as the list reads it.
 */
export type RoleHost = {
	/** make a custom role, named and carrying `mask`, directly below `afterRoleId`. */
	create: (name: string, mask: number, afterRoleId: string) => Promise<OrganizationRole>;
	/** rename a custom role; the three every organization has keep their names. */
	rename: (roleId: string, name: string) => Promise<OrganizationRole>;
	/** change what a role carries: the manager's, the member's or a custom one, never the owner's. */
	setMask: (roleId: string, mask: number) => Promise<OrganizationRole>;
	/** move a custom role to directly below `afterRoleId`, the manager or another custom role. */
	move: (roleId: string, afterRoleId: string) => Promise<OrganizationRole>;
	/**
	 * delete a custom role; everybody who held it holds the member role from here on, exactly:
	 * the override they carried is cleared (effort 838, requirement 6 as amended 2026-09-27).
	 */
	remove: (roleId: string) => Promise<void>;
};
