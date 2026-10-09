/**
 * READ
 *
 * Whether a read failed, decided in one place for every surface that draws one: the lists, the
 * record surfaces, the workspace page and the landing screen ([[rules/interface]], *Empty* and
 * *Error*).
 *
 * **Failed means the read errored and holds nothing to show.** A refetch that fails while an
 * earlier answer is held keeps that answer on screen, since what the reader sees is still what
 * was read; a read that succeeded with no rows is a set with nothing in it; a read still on its
 * way is loading. Only the first is drawn as a failure, with *try again* as its act. The query
 * client retries nothing by itself (`startup/component/root.svelte`), so the reader's *try again*
 * is the only retry there is.
 *
 * **A record that is not there is not a failed read.** A record's read answers with nothing for a
 * record that does not exist, and the query client takes an answer of `undefined` for a read that
 * failed, so every record a surface reads is read through {@link readRecord}, which answers `null`
 * instead: the read succeeded, and the surface says *not found*.
 */

/** What this reads of a query's result: the part every query hook here returns. */
export type ReadResult = {
	/** Whether the last run of the read errored. */
	readonly isError: boolean;
	/** What the read holds, or `undefined` where it holds nothing yet. */
	readonly data: unknown;
	/** Run the read again. */
	refetch: () => unknown;
};

/** What a surface draws from a read: whether it failed, and what runs it again. */
export type ReadFailure = {
	/** Whether the read failed with nothing to show, so the surface draws the failed state. */
	failed: boolean;
	/** Run the read again: the failed state's *try again*. */
	retry: () => void;
};

/** Whether `query` failed, and how to run it again. */
export function toReadFailure(query: ReadResult): ReadFailure {
	return {
		failed: query.isError && query.data === undefined,
		retry: () => void query.refetch()
	};
}

/**
 * A record's read, answering `null` where the record is not there.
 *
 * The query client refuses an answer of `undefined` as a failed read, so a record that does not
 * exist would be drawn as a read that failed. Read through this, it is a read that answered with
 * nothing, which the record surface draws as *not found*. A read that is refused stays refused.
 */
export async function readRecord<T>(read: Promise<T | undefined>): Promise<T | null> {
	return (await read) ?? null;
}
