/** What the list shell needs of a group to tell one from the next. */
export type ListGroup = {
	/** Distinguishes this group from the one before it in the query's order. */
	key: string;
};

/**
 * One row a list renders: the header opening a group, or the records laid out side by side
 * in it — one record, unless the list is more than one record wide.
 */
export type ListRow<TData, TGroup extends ListGroup> =
	| { kind: 'header'; key: string; group: TGroup }
	| { kind: 'record'; key: string; records: TData[] };

/**
 * The rows a list renders for `data`, in the order the query returned it.
 *
 * Without `groupOf` every record is a row and nothing is inserted. With it, a header row
 * opens each run of adjacent records sharing a group key — so a key that comes back after
 * another group opens a second group rather than rejoining the first. Grouping reads the
 * query's order and never reorders it: a record the query placed between two others stays
 * there, whatever its key.
 *
 * `recordsPerRow` is how many records the list fits across, which is one for every shape
 * that reads top to bottom and more for a shape laid out as a grid. A row is filled before
 * the next opens, and a group always starts on a row of its own — a row spanning two groups
 * would sit under one header and say nothing about the records from the other group.
 *
 * Row keys are derived from record ids, so a header's key survives the group's label
 * changing and stays unique when a key repeats.
 */
export function listRows<TData extends { id: number }, TGroup extends ListGroup>(
	data: readonly TData[],
	groupOf?: (record: TData) => TGroup,
	recordsPerRow = 1
): ListRow<TData, TGroup>[] {
	const rows: ListRow<TData, TGroup>[] = [];
	const width = Math.max(1, Math.floor(recordsPerRow));
	let openGroupKey: string | null = null;
	let openRow: { kind: 'record'; key: string; records: TData[] } | null = null;

	for (const record of data) {
		if (groupOf) {
			const group = groupOf(record);

			if (group.key !== openGroupKey) {
				rows.push({ kind: 'header', key: `group:${record.id}`, group });
				openGroupKey = group.key;
				openRow = null;
			}
		}

		if (openRow && openRow.records.length < width) {
			openRow.records.push(record);
			continue;
		}

		openRow = { kind: 'record', key: `record:${record.id}`, records: [record] };
		rows.push(openRow);
	}

	return rows;
}

/**
 * The row index of the header that stays at the top of the viewport while its group scrolls,
 * given the first row currently visible — or `null` when no header sits at or above it.
 *
 * A header is pinned from the moment its own row reaches the top until the next group's
 * header takes its place, which is why the search runs backwards from the first visible row
 * rather than forwards from it.
 */
export function stickyGroupRowIndex<TData, TGroup extends ListGroup>(
	rows: readonly ListRow<TData, TGroup>[],
	firstVisibleRowIndex: number
): number | null {
	for (let index = Math.min(firstVisibleRowIndex, rows.length - 1); index >= 0; index -= 1) {
		if (rows[index].kind === 'header') {
			return index;
		}
	}

	return null;
}
