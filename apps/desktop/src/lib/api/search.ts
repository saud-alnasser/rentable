import z from 'zod';

/**
 * RECORD SEARCH
 *
 * the shape every concept answers a palette search in. The palette reaches records the user
 * has not navigated to, so each concept narrows in SQL and returns a handful — never a set to
 * be filtered on the way back.
 *
 * It is one shape rather than five because the surface presenting them is one: a row shows a
 * record's own handle and whatever places it, and knows nothing else about the concept.
 */
export const RecordSearchSchema = z.object({
	term: z.string().trim().min(1),
	limit: z.number().int().positive().max(20).default(5)
});

/** One record a search found: what it is called, and what places it. */
export type RecordMatch = {
	id: string;
	/** the record's own handle — a name, a reference, an amount. */
	label: string;
	/** what places it: the complex a unit is in, the tenant a contract is held by. */
	hint: string;
};
