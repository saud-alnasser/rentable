import type { RecordAct } from '$lib/act';
import type { TranslationFunctions } from '$lib/i18n/i18n-types';
import type {
	OrganizationMember,
	OrganizationRole,
	OrganizationSession
} from '$lib/organization/host';
import { lockedRefusal } from '../locked';
import { effective, permits, type Flag } from '@rentable/workspace-permission';
import ArrowDownIcon from '@lucide/svelte/icons/arrow-down';
import ArrowUpIcon from '@lucide/svelte/icons/arrow-up';
import SquarePenIcon from '@lucide/svelte/icons/square-pen';
import Trash2Icon from '@lucide/svelte/icons/trash-2';

import { firstUnheldMoved, flagPhrase, moveOf } from './role';

/**
 * ROLE ACTS
 *
 * Everything a reader can do to one role from the roles block, on the terms the member and
 * workspace acts beside it keep (`../member/acts.ts`): one list, every surface a projection of it,
 * and an act the reader may not take saying why.
 */

/** why a flag the reader lacks refuses an act, naming the flag. */
export const lacking = (t: TranslationFunctions, flag: Flag) =>
	t.organization.dashboard.lacksFlag({ flag: flagPhrase(t, flag) });

/** who is reading the roles block, and what their row lets them do to a role. */
export type RoleReader = {
	/** how high the reader's role stands: a role is changed only from strictly above it. */
	rank: number;
	/** `manageRoles`. */
	canManageRoles: boolean;
	/** what the reader may do, which is what they may put in a role. */
	permissions: number;
	/** whether the reader is locked, which refuses every role act first (effort 851). */
	locked: boolean;
};

/** the role acts that run on the press and are waiting on the shell, while they are. */
export type RolePending = { moving: boolean };

/** What a role act is given: the role, every role beside it, and who is reading. */
export type RoleActRecord = {
	role: OrganizationRole;
	/** every role, which is what a move is placed among. */
	roles: readonly OrganizationRole[];
	/**
	 * every member, whose holders of the role a delete moves to the member role and an edit of
	 * the role changes (ticket 45 of effort 838).
	 */
	members: readonly OrganizationMember[];
	reader: RoleReader;
	pending: RolePending;
};

/** who is reading, as the role acts are gated on it, read off the session. */
export const roleReaderOf = (session: OrganizationSession): RoleReader => ({
	rank: session.rank,
	canManageRoles: permits(session.permissions, 'manageRoles'),
	permissions: session.permissions,
	locked: session.locked
});

/** Every role act, by the id it is keyed on. */
export type RoleActId = 'role.edit' | 'role.moveUp' | 'role.moveDown' | 'role.delete';

/** What the role acts ask of the organization host. */
export type RoleHostRequests = {
	/** open the role editor on the role. */
	edit: (record: RoleActRecord) => void;
	/** place the role directly below another, which is what moving it one place is. */
	move: (record: RoleActRecord, afterRoleId: string) => void;
	/** ask before deleting the role. */
	confirmDelete: (record: RoleActRecord) => void;
};

/** A role act, with the id narrowed to the ones declared here. */
export type RoleAct = RecordAct<RoleActRecord> & { id: RoleActId };

/**
 * why a role act cannot run at all: the reader is locked, lacks `manageRoles`, or the role is not
 * below them.
 * The flag first, because it refuses every role alike.
 */
const roleRefusal = ({ role, reader }: RoleActRecord, t: TranslationFunctions) => {
	const locked = lockedRefusal(reader.locked, t);

	if (locked) return locked;
	if (!reader.canManageRoles) return lacking(t, 'manageRoles');

	return role.rank >= reader.rank ? t.organization.roleList.notBelowYou() : undefined;
};

/**
 * why a delete cannot run, where the role could otherwise be deleted: its holders move to the
 * member role and hold it exactly (requirement 6 as amended 2026-09-27), and each flag that moves
 * for one of them is one the reader must hold (requirement 7), as Rust asks on the press. The
 * first holder and flag are named.
 */
const deleteRefusal = (record: RoleActRecord, t: TranslationFunctions) => {
	const refused = roleRefusal(record, t);

	if (refused) return refused;

	const memberMask = record.roles.find((role) => role.kind === 'member')?.mask ?? 0;

	for (const holder of record.members) {
		if (holder.roleId !== record.role.id) continue;

		const flag = firstUnheldMoved(
			record.reader.permissions,
			effective(record.role.mask, holder.override),
			memberMask
		);

		if (flag) {
			return t.organization.foreseen.deleteMoves({
				username: holder.username,
				flag: flagPhrase(t, flag)
			});
		}
	}

	return undefined;
};

/** why a move cannot run, where the role could otherwise be moved. */
const moveRefusal = (record: RoleActRecord, direction: 'up' | 'down', t: TranslationFunctions) => {
	const refused = roleRefusal(record, t);

	if (refused) return refused;

	const move = moveOf(record.roles, record.role.id, direction, record.reader.rank);

	if ('refused' in move) return t.organization.roleList[move.refused]();

	return record.pending.moving ? t.common.actions.working() : undefined;
};

/** a move one place, run where it can be placed. */
const moving = (host: RoleHostRequests, direction: 'up' | 'down') => (record: RoleActRecord) => {
	const move = moveOf(record.roles, record.role.id, direction, record.reader.rank);

	if ('afterRoleId' in move) host.move(record, move.afterRoleId);
};

/**
 * The role's acts (effort 838, requirement 4), bound to the host: what it carries, then where it
 * stands, then deleting it.
 *
 * **The owner's role has none.** It carries every flag and is never edited, moved or deleted, so
 * its card has nothing to refuse. The manager's and the member's are edited and never moved or
 * deleted; a custom role takes all four.
 */
export function declareRoleActs(host: RoleHostRequests): RoleAct[] {
	return [
		{
			id: 'role.edit',
			label: (t) => t.common.actions.edit(),
			icon: SquarePenIcon,
			group: 'primary',
			appliesTo: ({ role }) => role.kind !== 'owner',
			unavailable: roleRefusal,
			run: host.edit
		},
		{
			id: 'role.moveUp',
			label: (t) => t.organization.roleList.moveUp(),
			icon: ArrowUpIcon,
			group: 'lifecycle',
			appliesTo: ({ role }) => role.kind === 'custom',
			unavailable: (record, t) => moveRefusal(record, 'up', t),
			run: moving(host, 'up')
		},
		{
			id: 'role.moveDown',
			label: (t) => t.organization.roleList.moveDown(),
			icon: ArrowDownIcon,
			group: 'lifecycle',
			appliesTo: ({ role }) => role.kind === 'custom',
			unavailable: (record, t) => moveRefusal(record, 'down', t),
			run: moving(host, 'down')
		},
		{
			// its holders move to the member role, and no organization act is undone, so it asks.
			id: 'role.delete',
			label: (t) => t.common.actions.delete(),
			icon: Trash2Icon,
			tone: 'error',
			group: 'destructive',
			confirmation: 'irreversible',
			appliesTo: ({ role }) => role.kind === 'custom',
			unavailable: deleteRefusal,
			run: host.confirmDelete
		}
	];
}
