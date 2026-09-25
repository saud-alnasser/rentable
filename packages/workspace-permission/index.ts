/**
 * WORKSPACE PERMISSION
 *
 * What a member may do, as one bitmask of named flags (effort 838, requirement 1).
 *
 * Three families share the mask: the organization's administration on bits 0 to 9, the acts only
 * the owner performs on bits 10 to 17, and, for each record kind, viewing, creating, editing and
 * deleting on bits 20 to 39. Bits 18, 19 and 40 to 52 are free. A member's permissions are their
 * role's mask exclusive-or'd with their own override, which is [`effective`].
 *
 * **Each name maps to a bit index, and no index may reach 53.** Decision 04 chose one
 * `INTEGER` column over four alternatives on the strength of a guard that fails loudly at the
 * 54th flag, because the failure it prevents is silent: a permission value using bit 53 is
 * past 2^53, where the *low-order* bits round away — so defining a 54th flag would corrupt the
 * first flags ever defined, retroactively, on every row already written.
 * `./tests/permission.test.ts` is that guard. Its removal condition is decision 04's: when a
 * 54th flag is genuinely wanted, this column becomes a row per granted permission, which is a
 * migration rather than a rewrite.
 *
 * **Every routine here is arithmetic, never `|`, `&` or `^`.** JavaScript's bitwise operators
 * coerce to a signed 32-bit integer, so `1 << 40` is `256` and `x ^ y` silently drops everything
 * above bit 31. The record flags start at bit 20 and end at 39, past that ceiling, so an operator
 * that reads naturally would lose the payment flags on every row.
 *
 * **Rust holds a copy of every table here** (`organization/permission.rs`) and reads this file as
 * text to prove the two agree, so the tables are written out in a shape that reading can follow:
 * one `name: bit` per line, and flag names quoted.
 */
export const FLAGS = {
	inviteMember: 0,
	removeMember: 1,
	assignRole: 2,
	renameWorkspace: 3,
	resetPassword: 4,
	renameMember: 5,
	grantWorkspace: 6,
	manageRoles: 7,
	overrideMember: 8,
	manageMark: 9,
	createWorkspace: 10,
	deleteWorkspace: 11,
	mintReadOnly: 12,
	lockOut: 13,
	renewCredentials: 14,
	tursoAccount: 15,
	transferOwnership: 16,
	deleteOrganization: 17,
	viewComplex: 20,
	createComplex: 21,
	editComplex: 22,
	deleteComplex: 23,
	viewUnit: 24,
	createUnit: 25,
	editUnit: 26,
	deleteUnit: 27,
	viewTenant: 28,
	createTenant: 29,
	editTenant: 30,
	deleteTenant: 31,
	viewContract: 32,
	createContract: 33,
	editContract: 34,
	deleteContract: 35,
	viewPayment: 36,
	createPayment: 37,
	editPayment: 38,
	deletePayment: 39
} as const;

export type Flag = keyof typeof FLAGS;

/** Every flag, in bit order. */
export const EVERY_FLAG = Object.keys(FLAGS) as Flag[];

/**
 * The flags grouped the way an editor lists them: the member's administration, the owner's acts,
 * and one family per record kind, each in the order view, create, edit, delete.
 */
export const FAMILIES = {
	administration: [
		'inviteMember',
		'removeMember',
		'assignRole',
		'renameWorkspace',
		'resetPassword',
		'renameMember',
		'grantWorkspace',
		'manageRoles',
		'overrideMember',
		'manageMark'
	],
	owner: [
		'createWorkspace',
		'deleteWorkspace',
		'mintReadOnly',
		'lockOut',
		'renewCredentials',
		'tursoAccount',
		'transferOwnership',
		'deleteOrganization'
	],
	complex: ['viewComplex', 'createComplex', 'editComplex', 'deleteComplex'],
	unit: ['viewUnit', 'createUnit', 'editUnit', 'deleteUnit'],
	tenant: ['viewTenant', 'createTenant', 'editTenant', 'deleteTenant'],
	contract: ['viewContract', 'createContract', 'editContract', 'deleteContract'],
	payment: ['viewPayment', 'createPayment', 'editPayment', 'deletePayment']
} as const satisfies Record<string, readonly Flag[]>;

export type Family = keyof typeof FAMILIES;

/**
 * The flags only the owner holds (requirement 2). Each needs the Turso authority, which sits in
 * the owner's keyring and in no row, or is the handover of the organization itself; no role and
 * no override carries one.
 */
export const OWNER_ONLY: readonly Flag[] = FAMILIES.owner;

/**
 * The six flags that make a member a signer of member rows: whoever holds one of them writes a
 * row about another member, and the chain of trust asks for one of them before a certificate may
 * issue another.
 */
export const MEMBER_ADMINISTRATION: readonly Flag[] = [
	'inviteMember',
	'removeMember',
	'assignRole',
	'overrideMember',
	'renameMember',
	'resetPassword'
];

/** Creating, editing and deleting every record kind: what a read-only grant takes away. */
export const WRITE_FLAGS: readonly Flag[] = [
	'createComplex',
	'editComplex',
	'deleteComplex',
	'createUnit',
	'editUnit',
	'deleteUnit',
	'createTenant',
	'editTenant',
	'deleteTenant',
	'createContract',
	'editContract',
	'deleteContract',
	'createPayment',
	'editPayment',
	'deletePayment'
];

/**
 * Today's seven acts of administration, under today's names, on the bits `FLAGS` gives them.
 *
 * **Kept so no importer moves while the vocabulary does.** `changeRole` is `assignRole` under the
 * name every caller still spells, on the same bit. Ticket 11 of effort 838 retires this table and
 * the two below it once nothing reads them.
 */
export const ADMINISTRATION = {
	inviteMember: FLAGS.inviteMember,
	removeMember: FLAGS.removeMember,
	changeRole: FLAGS.assignRole,
	renameWorkspace: FLAGS.renameWorkspace,
	resetPassword: FLAGS.resetPassword,
	renameMember: FLAGS.renameMember,
	grantWorkspace: FLAGS.grantWorkspace
} as const;

export type Administration = keyof typeof ADMINISTRATION;

/** Anything a gate or a mask may name: a flag, or one of today's names for it. */
export type Named = Flag | Administration;

const BIT: Record<Named, number> = { ...FLAGS, ...ADMINISTRATION };

/**
 * One act at least.
 *
 * **A gate that names no acts is a caller mistake, not a gate that lets everybody through.**
 * `acts.every(...)` over an empty list is `true`, so an empty gate opens for a member who
 * administers nothing, which is the worst shape a permission bug can take: it looks exactly like
 * a gate that is working. Every surface that takes a list of acts to refuse somebody by takes
 * this, so the mistake is a compile error at the place it would be made.
 *
 * **`maskOf` deliberately does not take it.** An empty mask is `0`, which is *administers
 * nothing* and is a real value on real rows. Naming nothing is meaningful there and meaningless
 * in a gate, and the difference is why the shape is not simply pushed onto everything here.
 */
export type NamedActs = readonly [Administration, ...Administration[]];

/**
 * The highest bit a flag may occupy.
 *
 * 52 rather than 53, and the off-by-one is the whole point: bits 0 through 52 inclusive are
 * 53 flags, and their combined value is 2^53 - 1, the last integer JavaScript holds exactly.
 */
export const HIGHEST_USABLE_BIT = 52;

export const EVERY_ADMINISTRATION = Object.keys(ADMINISTRATION) as Administration[];

const isSet = (value: number, bit: number): boolean => Math.floor(value / 2 ** bit) % 2 === 1;

/**
 * Combine flags into the value stored on a row.
 *
 * **Addition, not `|`**, for the reason the header gives. Distinct powers of two sum to exactly
 * what an OR of them would produce, without the coercion.
 *
 * A name given twice is counted once, which `|` would have given for free and addition does
 * not: `2 + 2` is `4`, so a repeated flag would set the bit above the one asked for. The same
 * holds for a flag named once by its own name and once by its alias.
 */
export const maskOf = (...names: readonly Named[]): number =>
	[...new Set(names.map((name) => BIT[name]))].reduce((mask, bit) => mask + 2 ** bit, 0);

/** Whether a stored permission value carries one flag. Arithmetic, for the reason `maskOf` is. */
export const permits = (permissions: number, name: Named): boolean => isSet(permissions, BIT[name]);

/**
 * The exclusive-or of two masks, bit by bit up to [`HIGHEST_USABLE_BIT`].
 *
 * `^` would read the same and be wrong past bit 31, which is where the contract and payment flags
 * sit.
 */
export const xorOf = (left: number, right: number): number => {
	let result = 0;

	for (let bit = 0; bit <= HIGHEST_USABLE_BIT; bit++) {
		if (isSet(left, bit) !== isSet(right, bit)) {
			result += 2 ** bit;
		}
	}

	return result;
};

/**
 * A member's permissions: their role's mask, with every flag their override names switched
 * (requirement 6). A flag set in the override turns the role's flag off where the role carries
 * it, and on where it does not. The one computation, and Rust's `effective` is held to it by the
 * shared table in `./tests/effective.json`.
 */
export const effective = (roleMask: number, override: number): number => xorOf(roleMask, override);

/** How a member reaches one workspace, in the spelling a grant row stores. */
export type AccessLevel = 'full-access' | 'read-only';

/**
 * A member's permissions inside one workspace. A read-only grant clears every flag in
 * [`WRITE_FLAGS`], whatever the role and the override say (requirement 10).
 */
export const effectiveIn = (permissions: number, accessLevel: AccessLevel): number =>
	accessLevel === 'read-only'
		? WRITE_FLAGS.reduce(
				(mask, name) => (permits(mask, name) ? mask - 2 ** FLAGS[name] : mask),
				permissions
			)
		: permissions;

/**
 * What a membership row can be called, today.
 *
 * **Declared here rather than imported, and that is the one thing this package could not bring
 * with it.** It was `Membership['role']`, derived from the control plane's own schema, which is
 * where the column actually is. A package both applications depend on cannot depend on either of
 * them, so the union is written out and the schema is held to it by a type-level assertion in
 * `database/schema.ts` — a role added to the column and not to this line fails a typecheck rather
 * than a test.
 *
 * *Two declarations of one union is the drift this package exists to remove, in the one place it
 * cannot reach. The assertion is the whole of the mitigation, and it is not optional.*
 *
 * [`RoleKind`] is what it becomes once the roles are rows; it stays until the callers move.
 */
export type Role = 'owner' | 'administrator' | 'member';

/** The kind of a role: one of the three every organization has, or one it made itself. */
export type RoleKind = 'owner' | 'manager' | 'member' | 'custom';

export type BuiltInRole = {
	readonly id: Exclude<RoleKind, 'custom'>;
	readonly rank: number;
	readonly mask: number;
};

/**
 * The three roles every organization has (requirement 3), each with its id, its rank and the mask
 * it is created with.
 *
 * The owner carries every flag and its mask is never edited. The manager carries every flag but
 * the owner's. The member views every record kind and creates and edits records, and deletes and
 * administers nothing. A custom role ranks strictly between the member and the manager.
 */
export const BUILT_IN = {
	owner: {
		id: 'owner',
		rank: 2_000_000,
		mask: maskOf(...EVERY_FLAG)
	},
	manager: {
		id: 'manager',
		rank: 1_000_000,
		mask: maskOf(...EVERY_FLAG.filter((flag) => !OWNER_ONLY.includes(flag)))
	},
	member: {
		id: 'member',
		rank: 0,
		mask: maskOf(
			'viewComplex',
			'createComplex',
			'editComplex',
			'viewUnit',
			'createUnit',
			'editUnit',
			'viewTenant',
			'createTenant',
			'editTenant',
			'viewContract',
			'createContract',
			'editContract',
			'viewPayment',
			'createPayment',
			'editPayment'
		)
	}
} as const satisfies Record<Exclude<RoleKind, 'custom'>, BuiltInRole>;

/**
 * What each of today's roles administers by default.
 *
 * The role is what a person is called; the column is what they may do. Both are stored,
 * because an organization may want an administrator who cannot rename a member, and a role that
 * computed its own permissions on read could not express that.
 *
 * **The owner and the administrator carry every act here, and the difference between them is not
 * in this table.** *Requirement 5 of effort 826.* What separates them is the acts nobody can be
 * given: creating and deleting a workspace, minting a read-only credential, locking a member out,
 * renewing credentials, the Turso account and the organization's own link. Those need the Turso
 * authority, which lives on one machine and in no row, so they are refused in Rust by an owner
 * check rather than named here. A table that listed them would be offering a flag that granting
 * cannot deliver.
 *
 * **The column is still the truth.** A member's row is widened or narrowed one act at a time by a
 * holder of `changeRole`, so what this table gives is what a person is created with rather than
 * what they may do ever after.
 *
 * *Kept for today's importers; [`BUILT_IN`] is what replaces it.*
 */
export const ADMINISTRATION_BY_ROLE: Record<Role, number> = {
	owner: maskOf(...EVERY_ADMINISTRATION),
	administrator: maskOf(...EVERY_ADMINISTRATION),
	member: 0
};
