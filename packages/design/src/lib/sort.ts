/** Which column a list is ordered by, and in which direction. */
export type ListSort = {
	/** The column's id, which is also the key the list query orders by. */
	columnId: string;
	direction: 'asc' | 'desc';
};

/**
 * The sort a list moves to when the reader chooses `columnId`.
 *
 * A column the list is not already ordered by starts ascending; the column it is ordered by
 * reverses, then gives the order back to the list, whose own default is `null`. A column
 * outside `sortableColumnIds` cannot be ordered by — the query orders on a whitelist, and a
 * control that offered anything else would produce a sort nothing can answer.
 */
export function nextListSort(
	current: ListSort | null,
	columnId: string,
	sortableColumnIds: readonly string[]
): ListSort | null {
	if (!sortableColumnIds.includes(columnId)) {
		return current;
	}

	if (current?.columnId !== columnId) {
		return { columnId, direction: 'asc' };
	}

	return current.direction === 'asc' ? { columnId, direction: 'desc' } : null;
}
