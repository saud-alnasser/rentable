import { procedure, router } from '$lib/api/trpc';
import { newId } from '$lib/platform/database/identity';
import { matchesAnySearch } from '$lib/platform/database/search';
import * as s from '$lib/platform/database/schema';
import { HistorySchema } from '$lib/platform/database/schema';
import { and, desc, eq } from 'drizzle-orm';
import z from 'zod';

/**
 * HISTORY ROUTER
 *
 * what was done to a record, appended as it happens and read back afterwards.
 *
 * **It is a record and never a second write path.** Nothing in the application reconstructs
 * anything from these rows — undo remains the session stack of inverses it was decided to be,
 * replayed through the real procedures. That is what keeps this from being the durable journal
 * [[rules/data]], under *Undo*, rejected: that one was rejected as a way of *reversing* work
 * across the remote boundary, and this one only ever answers a question.
 */

/** How many entries a record's own surface shows before the reader asks for more. */
const ENTRY_LIMIT = 50;

const HistoryAppendSchema = HistorySchema.omit({ id: true, at: true });
const HistoryReadSchema = HistorySchema.pick({ concept: true, recordId: true }).extend({
	search: z.string().optional(),
	limit: z.number().int().positive().max(200).default(ENTRY_LIMIT)
});

export default router({
	/**
	 * Append what just happened.
	 *
	 * The clock is the context's rather than the caller's: an entry's time is when the
	 * application recorded it, and a webview that is wrong about the hour should not be able to
	 * write a record that disagrees with every other one.
	 */
	append: procedure.member
		.input(z.object({ entries: z.array(HistoryAppendSchema).min(1) }))
		.mutation(async ({ input, ctx }) => {
			const at = new Date(ctx.clock.now());

			// one insert for the whole set rather than one per entry: an action over a selection
			// leaves an entry per record, and a round trip each is what that would cost the moment
			// there is a wire here.
			await ctx.db.insert(s.history).values(
				input.entries.map((entry) => ({
					id: newId(),
					at,
					concept: entry.concept,
					recordId: entry.recordId,
					action: entry.action,
					record: entry.record
				}))
			);
		}),

	/**
	 * What was done to one record, most recent first.
	 *
	 * Ordered by identity after time, because two entries written in the same millisecond are
	 * otherwise in no order at all — and the one written second is the one that happened second.
	 */
	getMany: procedure.member.input(HistoryReadSchema).query(async ({ input, ctx }) => {
		const search = input.search?.trim();
		const entries = await ctx.db
			.select()
			.from(s.history)
			.where(
				and(
					eq(s.history.concept, input.concept),
					eq(s.history.recordId, input.recordId),
					// the action is matched as the key it is stored under, which is what the reader
					// sees only after it is rendered — so searching `terminated` finds it in either
					// language, and searching the Arabic word finds nothing. A history of one record
					// is short enough that this is a convenience rather than the way through it.
					search ? matchesAnySearch([s.history.action, s.history.record], search) : undefined
				)
			)
			.orderBy(desc(s.history.at), desc(s.history.id))
			.limit(input.limit);

		return entries.map((entry) => ({ ...entry, at: entry.at.getTime() }));
	})
});
