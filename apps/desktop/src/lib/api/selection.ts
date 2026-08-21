/**
 * SELECTION PLANNING
 *
 * What an action over several records would do, worked out once for the concepts that work it
 * out the same way.
 *
 * Three of this application's plans do. Each fetches the records and the one
 * table the rule turns on, and everything after those two reads is identical: group the
 * dependants by the column that owns them, then walk the ids in the order the reader named them
 * and ask the domain about each. What differs is the table, the column and which rule is called.
 * That is a parameter list rather than three procedures, and the parts worth getting right were
 * the parts written out three times: the reader's order, a record another device removed, an id
 * named twice.
 *
 * **Two of the five plans are deliberately not here.** A contract's takes an action and reads a
 * second dependant table only for one of them, and answers with a third thing its callers use; a
 * payment's reaches its dependant table through the record rather than grouping records by an
 * owner column, and neither answers with a name. A planner parameterised until it absorbed both
 * would say nothing about either.
 */

/**
 * One record an action would turn away, named the way its own surface names it.
 *
 * `name` is empty where there is nothing left to call the record by, which is the case a record
 * another device deleted mid-decision arrives as: the row it would have been named from is gone.
 * `design/selection.ts` is where that empty string is read, and says what a surface does with it.
 */
export type NamedRefusal<TReason extends string> = {
	id: string;
	name: string;
	reason: TReason;
};

/** What an action would do to a selection: the records that go through, and the rest with a reason. */
export type PlannedSelection<TRecord, TReason extends string> = {
	eligible: TRecord[];
	refused: NamedRefusal<TReason>[];
};

/**
 * Plan one action over one selection, from records and dependants that have already been read.
 *
 * The reads stay with the caller because only the caller knows which tables they are, and doing
 * them here would mean handing a query builder to a helper that has no business holding one. What
 * is shared is everything after them.
 *
 * **The ids are walked in the order they were named**, so what a confirmation lists reads the way
 * the selection does rather than the way the engine happened to answer. An id named twice is
 * planned once, and an id no record came back for is refused as `missing` with no name, whatever
 * the concept's own rule would have said about it.
 */
export function planSelection<
	TRecord extends { id: string },
	TDependant,
	TReason extends string
>(options: {
	/**
	 * the selected ids, in the order the reader named them.
	 *
	 * Repeats are collapsed here as well as by the caller, which has to collapse them anyway to
	 * build its own reads. Both are cheap and each is locally right: a helper that trusted its
	 * caller to have deduped would plan a record twice the first time one forgot.
	 */
	ids: readonly string[];
	/** the records those ids found. Fewer than `ids` where something is no longer there. */
	records: readonly TRecord[];
	/** every row of the one table the rule turns on, for the whole selection. */
	dependants: readonly TDependant[];
	/** which selected record a dependant belongs to. */
	ownerOf: (dependant: TDependant) => string;
	/** the record as its own surface names it. */
	nameOf: (record: TRecord) => string;
	/** the domain's rule, called rather than restated, so the plan and the mutation cannot differ. */
	whatRefuses: (dependants: TDependant[]) => TReason | undefined;
}): PlannedSelection<TRecord, TReason | 'missing'> {
	const named = [...new Set(options.ids)];
	const recordsById = new Map(options.records.map((record) => [record.id, record]));

	const dependantsByOwnerId = new Map<string, TDependant[]>();

	for (const dependant of options.dependants) {
		const owner = options.ownerOf(dependant);
		const held = dependantsByOwnerId.get(owner) ?? [];

		held.push(dependant);
		dependantsByOwnerId.set(owner, held);
	}

	const eligible: TRecord[] = [];
	const refused: NamedRefusal<TReason | 'missing'>[] = [];

	for (const id of named) {
		const record = recordsById.get(id);

		if (!record) {
			refused.push({ id, name: '', reason: 'missing' });

			continue;
		}

		const reason = options.whatRefuses(dependantsByOwnerId.get(id) ?? []);

		if (reason) {
			refused.push({ id, name: options.nameOf(record), reason });
		} else {
			eligible.push(record);
		}
	}

	return { eligible, refused };
}
