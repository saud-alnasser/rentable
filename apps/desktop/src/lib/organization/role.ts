import type { TranslationFunctions } from '$lib/i18n/i18n-types';
import type { OrganizationMember, OrganizationRole } from '$lib/platform/host';
import {
	BUILT_IN,
	EVERY_FLAG,
	FAMILIES,
	RECORD_KINDS,
	effective,
	firstWriteWithoutView,
	maskOf,
	permits,
	xorOf,
	type Family,
	type Flag,
	type RecordKind,
	type RoleKind
} from '@rentable/workspace-permission';

/**
 * The record kinds, in the order the switch list groups them, and each kind's first flag is its
 * view, the group's main switch (effort 838, requirement 12 as amended 2026-09-27). The package
 * holds them, since its `firstWriteWithoutView` walks the same kinds; they are handed on from here
 * so the interface reads them beside the rest of what it says about a role.
 */
export { RECORD_KINDS, type RecordKind };

/**
 * ROLES AND FLAGS, AS A READER IS TOLD ABOUT THEM
 *
 * What the organization section's roles block, the role editor and a member's card say about a
 * role and a flag (effort 838, requirement 12), and where a role can be moved to. Here rather than
 * in the components so the three say it one way, and so the arithmetic of a move can be checked
 * from a test that runs under Node.
 */

/**
 * The families a role or an override can carry, in the order an editor lists them.
 *
 * **The owner's family is not one of them.** No role and no override can carry an owner-only flag
 * (requirement 2), so an editor offering one would be offering a box nothing could tick; the
 * owner's own role lists it, because that role is the one that carries it.
 */
export const EDITABLE_FAMILIES = [
	'administration',
	'complex',
	'unit',
	'tenant',
	'contract',
	'payment'
] as const satisfies readonly Family[];

/** every family, in the order a role's card lists what it carries. */
export const LISTED_FAMILIES = Object.keys(FAMILIES) as Family[];

/**
 * the four verbs a record kind's flags are named by, in the order `FAMILIES` holds them: one set,
 * which a refusal, a switch and a role card's mix all read (`organization.flagVerbs`).
 */
const RECORD_VERBS = ['view', 'create', 'edit', 'delete'] as const;

type RecordVerb = (typeof RECORD_VERBS)[number];
type NamedFlag = keyof TranslationFunctions['organization']['flags'];

/** the family a flag sits in. */
export const familyOf = (flag: Flag): Family =>
	LISTED_FAMILIES.find((family) => (FAMILIES[family] as readonly Flag[]).includes(flag))!;

/** the verb a record flag is, or `null` for the organization's and the owner's. */
const verbOf = (flag: Flag): RecordVerb | null => {
	const family = familyOf(flag);

	if (family === 'administration' || family === 'owner') return null;

	return RECORD_VERBS[(FAMILIES[family] as readonly Flag[]).indexOf(flag)];
};

/** what a family is called: `complexes`, `the organization`. */
export const familyName = (t: TranslationFunctions, family: Family): string =>
	t.organization.families[family]();

/**
 * what a flag is called under its family's name: a record flag is its verb alone (`view`, under
 * `complexes`), and the organization's and the owner's say what the person does.
 */
export const flagName = (t: TranslationFunctions, flag: Flag): string => {
	const verb = verbOf(flag);

	return verb ? t.organization.flagVerbs[verb]() : t.organization.flags[flag as NamedFlag]();
};

/**
 * what a flag is called on its own, where no family heads it: `view complexes`, `manage roles`.
 * What a refusal names, and what a control's accessible name carries.
 */
export const flagPhrase = (t: TranslationFunctions, flag: Flag): string => {
	const verb = verbOf(flag);

	return verb
		? `${t.organization.flagVerbs[verb]()} ${familyName(t, familyOf(flag))}`
		: t.organization.flags[flag as NamedFlag]();
};

/** the flag that lets a person see a kind at all: the switch its group is headed by. */
export const viewOf = (kind: RecordKind): Flag => FAMILIES[kind][0];

/** a kind's add, edit and delete, which sit under its view and need it. */
export const writesOf = (kind: RecordKind): Flag[] => FAMILIES[kind].slice(1);

/**
 * a mask with one switch turned on or off. **Turning a kind's view off turns its add, edit and
 * delete off with it**, since writing a record needs seeing it (requirement 6 as amended
 * 2026-09-27), so no switch that is out of sight is left on.
 */
export const switchedTo = (mask: number, flag: Flag, on: boolean): number => {
	const family = familyOf(flag);
	const turned: readonly Flag[] =
		!on && verbOf(flag) === 'view' ? (FAMILIES[family] as readonly Flag[]) : [flag];

	return turned.reduce(
		(next, each) => (permits(next, each) === on ? next : xorOf(next, maskOf(each))),
		mask
	);
};

/**
 * How much of a kind of record a role gives, as one step on a ladder (effort 838, requirement 12
 * as amended 2026-09-27): each step is the one below it and one verb more, the way sharing
 * products name access (Notion's *full access*, *can edit*, *can view*).
 *
 * - `full`: view, add, edit and delete;
 * - `edit`: view, add and edit;
 * - `add`: view and add;
 * - `view`: view alone;
 * - `none`: nothing of the kind;
 * - `mixed`: anything else, such as view and delete without add.
 *
 * **A mix off the ladder is not rounded to a step.** Rounding view and delete down to *view only*
 * would hide a delete the role holds, and rounding it up would claim an add it does not, so a mix
 * reads as the verbs it carries (`levelWord`). A write without its view is refused since
 * requirement 6 was amended, but a mask stored before then can still carry one, and it reads the
 * same way.
 */
export type KindLevel = 'full' | 'edit' | 'add' | 'view' | 'none' | 'mixed';

/** the ladder's steps, by how many of a kind's verbs they carry from the view up. */
const LADDER = ['none', 'view', 'add', 'edit', 'full'] as const satisfies readonly KindLevel[];

/** the step a mask stands on for one kind of record. */
export const levelOf = (mask: number, kind: RecordKind): KindLevel => {
	const carried = FAMILIES[kind].map((flag) => permits(mask, flag));
	const gap = carried.indexOf(false);
	const reached = gap === -1 ? carried.length : gap;

	return carried.slice(reached).some(Boolean) ? 'mixed' : LADDER[reached];
};

/**
 * the words a role's card says for a kind: `can edit`, `view only`. A mix off the ladder is its
 * verbs as the switches name them (`view, delete`), joined by the reader's list format; a kind the
 * mask carries nothing of has no words, and is left out where it would be.
 *
 * **A role's card is what says it.** The switch list names no level: its folded administration
 * group shares with the card only the count of the organization's flags (`administrationHeld`)
 * and the words that count is said in.
 */
export const levelWord = (
	t: TranslationFunctions,
	list: Intl.ListFormat,
	mask: number,
	kind: RecordKind
): string | null => {
	const level = levelOf(mask, kind);

	switch (level) {
		case 'none':
			return null;
		case 'mixed':
			return list.format(
				FAMILIES[kind].flatMap((flag) => (permits(mask, flag) ? [flagName(t, flag)] : []))
			);
		// one name per thing: full access is what a workspace grant calls the same thing.
		case 'full':
			return t.organization.dashboard.accessFull();
		default:
			return t.organization.roleCard[level]();
	}
};

/** how many of the organization's own flags a mask carries: what its folded group counts. */
export const administrationHeld = (mask: number): number =>
	carriedIn(mask, 'administration').length;

/** how many there are to hold. */
export const ADMINISTRATION_TOTAL = FAMILIES.administration.length;

/** the flags of one family that a mask carries, in the family's order. */
export const carriedIn = (mask: number, family: Family): Flag[] =>
	(FAMILIES[family] as readonly Flag[]).filter((flag) => permits(mask, flag));

/**
 * What a role is called in the reader's language. The three every organization has are named by
 * the interface, and cross with an empty name; a role the organization made is called what it was
 * named.
 */
export const roleNameOf = (
	t: TranslationFunctions,
	role: { kind: RoleKind; name: string }
): string => {
	switch (role.kind) {
		case 'owner':
			return t.layout.signIn.roleOwner();
		case 'manager':
			return t.layout.signIn.roleManager();
		case 'member':
			return t.layout.signIn.roleMember();
		case 'custom':
			return role.name;
	}
};

/** what a member's role is called, off the member's own facts. */
export const memberRoleName = (
	t: TranslationFunctions,
	member: { role: RoleKind; roleName: string }
): string => roleNameOf(t, { kind: member.role, name: member.roleName });

/** who a built-in role is for, in one sentence; a role the organization made has none. */
export const roleWhoOf = (t: TranslationFunctions, kind: RoleKind): string | null => {
	switch (kind) {
		case 'owner':
			return t.organization.roles.owner.who();
		case 'manager':
			return t.organization.roles.manager.who();
		case 'member':
			return t.organization.roles.member.who();
		case 'custom':
			return null;
	}
};

/** the roles, highest rank first, which is the order every surface lists them in. */
export const byRank = (roles: readonly OrganizationRole[]): OrganizationRole[] =>
	[...roles].sort((one, other) => other.rank - one.rank);

/**
 * where a new role goes: directly below the lowest role that stands above the member, which puts
 * it just above the member.
 *
 * **The lowest place there is, and that is the point.** A role is made below its maker's rank, and
 * the lowest place is below every rank that may make one, so a holder of `manageRoles` in a custom
 * role is never handed a place they cannot put a role in. It is moved up from its card.
 */
export const newRolePlace = (roles: readonly OrganizationRole[]): string =>
	byRank(roles)
		.filter((role) => role.kind === 'manager' || role.kind === 'custom')
		.at(-1)?.id ?? BUILT_IN.manager.id;

/**
 * Where a custom role can move one place up or down, as the role `role_move` places it directly
 * below, or why it cannot.
 *
 * - **Up** is directly below the role two places above it, so the one above ends up beneath it. A
 *   role directly below the manager is already as high as a role goes; and the role above it must
 *   rank below the reader too, since the move puts this one above that one.
 * - **Down** is directly below the role beneath it. A role directly above the member is as low as
 *   a role goes.
 *
 * Whether the role itself ranks below the reader is the act's own gate, asked beside this.
 */
export type RoleMove = { afterRoleId: string } | { refused: 'highest' | 'lowest' | 'notBelowYou' };

export function moveOf(
	roles: readonly OrganizationRole[],
	roleId: string,
	direction: 'up' | 'down',
	readerRank: number
): RoleMove {
	const ordered = byRank(roles);
	const index = ordered.findIndex((role) => role.id === roleId);
	const above = ordered[index - 1];
	const below = ordered[index + 1];

	if (direction === 'down') {
		return below && below.kind === 'custom' ? { afterRoleId: below.id } : { refused: 'lowest' };
	}

	if (!above || above.kind !== 'custom') return { refused: 'highest' };

	if (above.rank >= readerRank) return { refused: 'notBelowYou' };

	return { afterRoleId: ordered[index - 2].id };
}

/**
 * The first flag a change moves that the reader does not hold, or `null` where they hold every
 * one it moves (requirement 7). **A flag switched off is as moved as one switched on**, which is
 * how Rust's `refuse_unheld` reads a change: over what the member ends up with before and after.
 * The interface asks it before the press, so the control that would be refused says so.
 */
export const firstUnheldMoved = (held: number, before: number, after: number): Flag | null =>
	EVERY_FLAG.find(
		(flag) => permits(before, flag) !== permits(after, flag) && !permits(held, flag)
	) ?? null;

/**
 * What a new role opens on: what a member carries, less every flag its maker does not hold, since
 * a role is made only of flags its maker holds (requirement 7). A kind whose view that leaves out
 * loses its add, edit and delete with it, since writing a record needs seeing it (requirement 6
 * as amended 2026-09-27). The owner holds every flag, so the owner's new role is the member's.
 */
export const newRoleMask = (held: number): number => {
	const kept = EVERY_FLAG.filter(
		(flag) => permits(BUILT_IN.member.mask, flag) && permits(held, flag)
	);

	return maskOf(
		...kept.filter((flag) => {
			const kind = RECORD_KINDS.find((each) => each === familyOf(flag));

			return !kind || kept.includes(viewOf(kind));
		})
	);
};

/**
 * The holders a role's new mask would leave adding, editing or deleting a kind of record they
 * cannot view, through what is changed for them alone (requirement 6 as amended 2026-09-27).
 * Rust refuses such a mask on save; a holder the change leaves as they were is not asked, as
 * Rust does not ask them.
 */
export const holdersWritingBlind = (
	holders: readonly Pick<OrganizationMember, 'username' | 'override'>[],
	savedMask: number,
	nextMask: number
): string[] =>
	holders
		.filter((holder) => {
			const after = effective(nextMask, holder.override);

			return (
				after !== effective(savedMask, holder.override) && firstWriteWithoutView(after) !== null
			);
		})
		.map((holder) => holder.username);

/** what a member's card has on it at a save, and what their row holds. */
type MemberChoice = { roleId: string; override: number };

/**
 * What one save of a member's card writes of their role and override (effort 838, requirements
 * 5 and 6).
 *
 * - **A changed role is one act, with the override the switches come to** wherever that is not
 *   nothing and the reader may override. Rust's `assign_role` clears the override where none is
 *   sent (requirement 6 as amended 2026-09-27), so an override equal to the one the member had
 *   is still sent: it is no longer what the new role leaves them with.
 * - **An override changed on its own is its own write.**
 */
export const memberWritesOf = (
	saved: MemberChoice,
	edit: MemberChoice,
	may: { canAssignRole: boolean; canOverride: boolean }
): {
	assign: { roleId: string; override: number | undefined } | null;
	override: number | null;
} => {
	if (may.canAssignRole && edit.roleId !== saved.roleId) {
		return {
			assign: {
				roleId: edit.roleId,
				override: may.canOverride && edit.override !== 0 ? edit.override : undefined
			},
			override: null
		};
	}

	return {
		assign: null,
		override: may.canOverride && edit.override !== saved.override ? edit.override : null
	};
};
