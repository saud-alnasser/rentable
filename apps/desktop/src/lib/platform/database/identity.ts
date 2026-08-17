import { TRPCError } from '@trpc/server';

/**
 * IDENTITY
 *
 * the engine assigns a row's identity, and a caller may state one instead — which is how
 * undoing a deletion puts a row back as the record it was rather than as a copy of it
 * (ADR 0026).
 *
 * A stated identity has to be free, and that is not a formality: the engine hands out the next
 * id above the highest in use, so an id freed by a deletion can have been given to another row
 * since. Without this the collision arrives as a constraint failure the user is shown as an
 * unexpected error, rather than as the refusal it is.
 *
 * @param existing whatever row the caller's lookup found; any row means the id is taken.
 */
export function ensureIdFree(existing: unknown) {
	if (existing) {
		throw new TRPCError({
			code: 'BAD_REQUEST',
			message: 'another record already holds that id'
		});
	}
}
