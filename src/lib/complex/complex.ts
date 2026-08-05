/**
 * COMPLEX
 *
 * the complex domain module: what a caller is allowed to ask for when reading the
 * complexes directory. The rules that decide whether a write is allowed still live in the
 * router beside the uniqueness checks they read the database for.
 */

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
