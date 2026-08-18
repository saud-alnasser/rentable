/**
 * LIST KEYBOARD
 *
 * Where the focus goes when a list is moved through from the keyboard, and what the list
 * registers so the sheet can say the keys exist.
 *
 * The whole of the decision is here rather than in the block, so it can be checked: a list block
 * reaches a `.svelte` file and cannot be imported by a test at all, and a rule about which record
 * comes next is exactly the kind that regresses silently. What the block keeps is the part that
 * is genuinely the DOM's — which element takes focus, and when it exists to take it.
 */
import type { ListGroup, ListRow } from '$lib/design/group';
import type { ShortcutRegistration } from '$lib/design/shortcut-registry';

/** One row of records, as moving through the list sees it. */
export type ListRecordRow = {
	/**
	 * where the row sits among every row the list lays out, group headers included — which is the
	 * index the virtualizer scrolls to, so it is what a position carries.
	 */
	row: number;
	/** how many records the row holds, which is the list's width except on a row a group cut short. */
	count: number;
};

/** Which record has the focus: the row it renders in, and its place across that row. */
export type ListPosition = {
	row: number;
	column: number;
};

/**
 * A move from one record to the next.
 *
 * Stated in reading order rather than in screen directions — *previous* and *next* rather than
 * left and right — because which arrow means which is the locale's answer and not this module's.
 */
export type ListMovement = 'previous' | 'next' | 'up' | 'down';

/**
 * The rows holding records, in the order they are laid out.
 *
 * Header rows are dropped rather than skipped over later: a header is not somewhere focus can
 * land, and leaving it in would make every move past a group boundary a special case. Their
 * indices are still what the rows carry, so a position always names a row the virtualizer knows.
 */
export function toRecordRows<TData extends { id: number }, TGroup extends ListGroup>(
	rows: readonly ListRow<TData, TGroup>[]
): ListRecordRow[] {
	return rows.flatMap((row, index) =>
		row.kind === 'record' ? [{ row: index, count: row.records.length }] : []
	);
}

/**
 * Which arrow key means which move, in the reading direction of the active locale.
 *
 * The sideways pair swaps and the vertical pair does not: a list reads right to left in Arabic
 * and still runs top to bottom. Anything else is not a move, which is what tells the caller to
 * leave the key to whatever else wanted it.
 */
export function toListMovement(key: string, direction: 'ltr' | 'rtl'): ListMovement | null {
	switch (key) {
		case 'ArrowUp':
			return 'up';
		case 'ArrowDown':
			return 'down';
		case 'ArrowRight':
			return direction === 'rtl' ? 'previous' : 'next';
		case 'ArrowLeft':
			return direction === 'rtl' ? 'next' : 'previous';
		default:
			return null;
	}
}

/** The last record of a row — where a backwards move arrives. */
function endOf(recordRow: ListRecordRow): ListPosition {
	return { row: recordRow.row, column: recordRow.count - 1 };
}

/** The same place across another row, or that row's last record where it is shorter. */
function alignedInto(recordRow: ListRecordRow, column: number): ListPosition {
	return { row: recordRow.row, column: Math.min(column, recordRow.count - 1) };
}

/**
 * Where a move starts when nothing holds the focus yet, or the row that held it is gone.
 *
 * **The first record, whichever way the move ran.** Answering a backwards move with the last
 * record is the symmetrical reading and the wrong one: there is no position to move back from,
 * the list is virtualized and usually thousands of rows long, and the reader would arrive at an
 * end they never asked for with no sense of having travelled.
 */
function entryInto(recordRows: readonly ListRecordRow[]): ListPosition {
	return { row: recordRows[0].row, column: 0 };
}

/**
 * Where the focus goes for one move, or `null` where the list has no records to move through.
 *
 * **Nothing wraps.** A list is virtualized and mostly longer than the window, so a move off the
 * end that reappeared at the other would teleport the reader somewhere they cannot see they
 * arrived at. A move with nowhere to go returns where it started, which keeps the focus visible
 * rather than dropping it.
 */
export function nextPosition(
	recordRows: readonly ListRecordRow[],
	focused: ListPosition | null,
	movement: ListMovement
): ListPosition | null {
	if (recordRows.length === 0) {
		return null;
	}

	if (!focused) {
		return entryInto(recordRows);
	}

	const index = recordRows.findIndex((candidate) => candidate.row === focused.row);

	// the row the focus was on is not there any more — a search narrowed the list under it. There
	// is nothing to move relative to, so this is an entry rather than a move.
	if (index === -1) {
		return entryInto(recordRows);
	}

	const here = recordRows[index];
	// a resize can narrow the list under a focus that was further across than the row now runs.
	const column = Math.min(focused.column, here.count - 1);
	const stay = { row: here.row, column };

	switch (movement) {
		case 'next':
			if (column + 1 < here.count) {
				return { row: here.row, column: column + 1 };
			}

			return index + 1 < recordRows.length ? { row: recordRows[index + 1].row, column: 0 } : stay;
		case 'previous':
			if (column > 0) {
				return { row: here.row, column: column - 1 };
			}

			return index > 0 ? endOf(recordRows[index - 1]) : stay;
		case 'down':
			return index + 1 < recordRows.length ? alignedInto(recordRows[index + 1], column) : stay;
		case 'up':
			return index > 0 ? alignedInto(recordRows[index - 1], column) : stay;
	}
}

/** the one key that puts the cursor in a list's search field. */
const SEARCH_KEY = '/';

/**
 * What a list registers while it is on screen.
 *
 * The search key is the application's, because it has to answer from wherever the reader is
 * standing on the surface — and it is registered by the list rather than by the shell so that it
 * exists only where there is a list to search. The two the reader presses inside the list are the
 * surface's: they mean nothing away from the records, and the block answers them on its own
 * element. They are registered anyway, because the sheet is where a reader learns a key is there.
 *
 * @param focusSearch what the search key does, passed in because the field belongs to the block.
 */
export function toListShortcuts(focusSearch: () => void): ShortcutRegistration[] {
	return [
		{
			id: 'list.search',
			scope: 'application',
			keys: [{ key: SEARCH_KEY }],
			describe: (translations) => translations.common.table.focusSearch(),
			// a lone punctuation key inside a field is a character the reader is typing, and taking
			// it would make every text field on a list surface unable to type it.
			standsDownWhileEditing: true,
			run: focusSearch
		},
		{
			id: 'list.move',
			scope: 'surface',
			keys: [{ key: 'ArrowUp' }, { key: 'ArrowDown' }, { key: 'ArrowLeft' }, { key: 'ArrowRight' }],
			describe: (translations) => translations.common.table.moveBetweenRecords()
		},
		{
			id: 'list.open',
			// answered by the record's own link, which is what the focus is on — so this is a
			// declaration and nothing else, and there is deliberately no handler behind it.
			scope: 'surface',
			keys: [{ key: 'Enter' }],
			describe: (translations) => translations.common.table.openRecord()
		}
	];
}
