import { TRPCError } from '@trpc/server';

/**
 * COMPLEX
 *
 * the complex domain module: what a caller is allowed to ask for when reading the
 * complexes directory. The rules that decide whether a write is allowed still live in the
 * router beside the uniqueness checks they read the database for.
 */

/**
 * Whether a complex may be deleted: no unit may belong to it.
 *
 * Exported beside the router that enforces it so a surface can say what blocks a deletion
 * before offering one, rather than restating the threshold in its own words.
 */
export const isComplexDeletable = (units: unknown[]) => units.length === 0;

/** Whether a unit may be deleted: no contract may hold it. The same shape, one level down. */
export const isUnitDeletable = (assignments: unknown[]) => assignments.length === 0;

/**
 * Refuse a set of unit names holding the same name twice.
 *
 * A collision *within* one submission is a case creating units one dialog at a time could
 * not produce: each was checked against what was stored, and there was never a set to check
 * against itself. The uniqueness the database enforces is per complex, so this is the same
 * rule read against the arriving set rather than against the table.
 *
 * @param names the unit names as submitted, in order.
 * @throws a `BAD_REQUEST` naming the first name that repeats.
 */
export function ensureUnitNamesDistinct(names: string[]) {
	const seen = new Set<string>();

	for (const name of names) {
		const normalized = name.trim().toLowerCase();

		if (seen.has(normalized)) {
			throw new TRPCError({
				code: 'BAD_REQUEST',
				message: `"${name.trim()}" is used twice; each unit needs its own name`
			});
		}

		seen.add(normalized);
	}
}

/**
 * The keys the complexes directory may be ordered by, and the whole of what its sort
 * control may offer — an order outside this list is one the query cannot answer, so the
 * router rejects it rather than silently falling back to the default.
 *
 * It lives here rather than beside the SQL because it decides what a caller is allowed to
 * ask for, and it is exported because the control has to be built from the same list: two
 * places naming the orders is how a control comes to offer one the query cannot serve.
 */
export const COMPLEX_SORT_COLUMN_IDS = [
	'name',
	'location',
	'unitCount',
	'vacantUnitCount'
] as const;

export type ComplexSortColumnId = (typeof COMPLEX_SORT_COLUMN_IDS)[number];
