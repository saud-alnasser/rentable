/**
 * SELECTION
 *
 * What an action over several records would do, read before any of it is done.
 *
 * A list offers an action on a selection; the concept behind that list answers what the action
 * would do to each record named. That answer is a plan, and it is a query rather than a guess
 * from the rows on screen: a row carries what its surface needed it to carry, which is rarely
 * what a refusal turns on.
 *
 * The vocabulary is here rather than in any one concept because five lists across four concepts
 * offer these actions, and a shape assembled per concept is five shapes that have to agree.
 */

/** One record an action would turn away, and why. */
export type SelectionRefusal<TReason extends string = string> = {
	id: string;
	/**
	 * the record as its own surface names it, or empty where it has nothing left to call it by.
	 *
	 * A record another device deleted while the reader was deciding is refused and cannot be
	 * named: the row it would have been named from is gone. The count against the reason is what
	 * carries that one, and a surface that insisted on a name would print a placeholder once per
	 * record instead.
	 */
	name: string;
	reason: TReason;
};

/** What an action would do to a selection. */
export type SelectionPlan<TReason extends string = string> = {
	/** the records that would go through, by id. */
	eligible: readonly string[];
	/** the rest, each with the reason it would not. */
	refused: readonly SelectionRefusal<TReason>[];
};

/**
 * How many turned-away records are worth naming beside their reason.
 *
 * Past a handful the names stop being something to act on and become the reason repeated, which
 * the count in front of them has already said once.
 */
export const NAMED_RECORDS = 4;

/** A reason an action turned records away, with how many it turned away for it. */
export type SelectionRefusalGroup<TReason extends string = string> = {
	reason: TReason;
	/** the refused records, in the order the reader named them. */
	records: readonly SelectionRefusal<TReason>[];
};

/**
 * The refusals grouped by reason, in the order the reasons were declared.
 *
 * Declared order rather than by size: which reason is worth reading first is a property of the
 * action, and a list that reorders itself with the data cannot be scanned twice the same way.
 * A reason nothing was refused for is dropped rather than shown as zero.
 */
export function groupRefusals<TReason extends string>(
	refused: readonly SelectionRefusal<TReason>[],
	reasons: readonly TReason[]
): SelectionRefusalGroup<TReason>[] {
	return reasons
		.map((reason) => ({
			reason,
			records: refused.filter((refusal) => refusal.reason === reason)
		}))
		.filter((group) => group.records.length > 0);
}
