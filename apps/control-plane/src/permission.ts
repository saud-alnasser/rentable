import type { Role } from './schema.ts';

/**
 * What a member may do *to* a workspace, as opposed to what they may do *in* one.
 *
 * Decision 05 settled that membership grants full access to a workspace's data, so nothing
 * here is about records. Every flag is an administrative act, and a workspace with no
 * administration still works — a lone member with a permission value of zero can read and
 * write their whole ledger.
 *
 * **Each name maps to a bit index, and no index may reach 53.** Decision 04 chose one
 * `INTEGER` column over four alternatives on the strength of a guard that fails loudly at the
 * 54th flag, because the failure it prevents is silent: a permission value using bit 53 is
 * past 2^53, where the *low-order* bits round away — so defining a 54th flag would corrupt the
 * first flags ever defined, retroactively, on every row already written. `./permission.test.mjs`
 * is that guard. Its removal condition is decision 04's: when a 54th flag is genuinely wanted,
 * this column becomes a row per granted permission, which is a migration rather than a rewrite.
 */
export const ADMINISTRATION = {
	inviteMember: 0,
	removeMember: 1,
	changeRole: 2,
	renameWorkspace: 3,
	deleteWorkspace: 4,
	transferOwnership: 5
} as const;

export type Administration = keyof typeof ADMINISTRATION;

/**
 * The highest bit a flag may occupy.
 *
 * 52 rather than 53, and the off-by-one is the whole point: bits 0 through 52 inclusive are
 * 53 flags, and their combined value is 2^53 - 1, the last integer JavaScript holds exactly.
 */
export const HIGHEST_USABLE_BIT = 52;

export const EVERY_ADMINISTRATION = Object.keys(ADMINISTRATION) as Administration[];

/**
 * Combine flags into the value stored on a membership row.
 *
 * **Addition, not `|`, and this is not a stylistic choice.** JavaScript's bitwise operators
 * coerce to a signed 32-bit integer, so `1 << 40` is `256` and `x | y` silently truncates
 * anything above bit 30 — a ceiling twenty-two bits below the one decision 04 chose. Distinct
 * powers of two sum to exactly what an OR of them would produce, without the coercion.
 *
 * A name given twice is counted once, which `|` would have given for free and addition does
 * not: `2 + 2` is `4`, so a repeated flag would set the bit above the one asked for.
 */
export const maskOf = (...names: readonly Administration[]): number =>
	[...new Set(names)].reduce((mask, name) => mask + 2 ** ADMINISTRATION[name], 0);

/** Whether a stored permission value carries one flag. Arithmetic, for the reason `maskOf` is. */
export const permits = (permissions: number, name: Administration): boolean =>
	Math.floor(permissions / 2 ** ADMINISTRATION[name]) % 2 === 1;

/**
 * What each role administers by default.
 *
 * The role is what a person is called; the column is what they may do. Both are stored,
 * because a workspace may want an administrator who cannot delete it, and a role that
 * computed its own permissions on read could not express that.
 */
export const ADMINISTRATION_BY_ROLE: Record<Role, number> = {
	owner: maskOf(...EVERY_ADMINISTRATION),
	administrator: maskOf('inviteMember', 'removeMember', 'changeRole', 'renameWorkspace'),
	member: 0
};
