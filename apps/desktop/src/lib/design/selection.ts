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
	 *
	 * **Two concepts answer with their own raw material and become a name here rather than in the
	 * procedure, and both are deliberate.** A contract answers with its government id, which is
	 * what its history and its rows already call it by. A payment answers with its amount, because
	 * a payment has no name at all and money is only renderable on the side that knows the
	 * reader's locale: a figure written one way in a ledger and another in a confirmation would be
	 * two answers to one question. Both surfaces write the empty string for a record that is no
	 * longer there, so what reaches this type is the same everywhere it is read.
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
 * The selected records, in the order the list is showing them.
 *
 * Filtered out of what is shown rather than assembled from the ids, which carry no order and no
 * rows: a selection is a set, and a file has to be written in some order. The list's own order is
 * the one the reader was looking at when they picked.
 *
 * **A selected record the list is no longer showing is not in the result.** The two can come
 * apart, because a selection survives the rows being unmounted and re-created and a refetch can
 * remove a record from under it. What a file holds is records that exist, so this narrows to what
 * is there rather than reporting the id of something that is not.
 */
export function selectedRecords<TRecord extends { id: string }>(
	shown: readonly TRecord[],
	selected: readonly string[]
): TRecord[] {
	const ids = new Set(selected);

	return shown.filter((record) => ids.has(record.id));
}

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

/**
 * One reason with the number of records it accounts for, in the reader's words.
 *
 * The shared confirmation is deliberately ignorant of any concept's reasons and hands one back as
 * a plain string, so every list needs the same lookup: find the sentence, and have an answer for a
 * reason that is not in the map. The sentences differ per concept because the reasons do; the
 * lookup around them never did, and it stood in five surfaces saying the same thing.
 *
 * **`missing` is the fallback because it is what an unrecognised reason means here.** Every
 * concept's reason union carries it, for a record that went away while the reader was deciding,
 * and a reason this surface has never heard of is a record it can no longer account for either.
 *
 * The lookup asks whether the map itself declared the reason rather than whether the value is
 * there, because a plain object answers `constructor` and `toString` from its prototype. Nothing
 * reaches this with such a reason today, and the guarantee above is worth being true rather than
 * true of the reasons that happen to arrive.
 *
 * **The totality check stays at the call site**, where `satisfies Record<TReason, ...>` on the map
 * makes a reason added to a domain rule without a sentence a build failure rather than a refusal
 * shown under somebody else's words. That is why this takes an index signature rather than a
 * `Record` of its own: a parameter type here would check the map against whatever was inferred
 * from the map.
 */
export function describeRefusals(labels: {
	missing: (count: number) => string;
	[reason: string]: (count: number) => string;
}): (reason: string, count: number) => string {
	return (reason, count) =>
		Object.hasOwn(labels, reason) ? labels[reason](count) : labels.missing(count);
}
