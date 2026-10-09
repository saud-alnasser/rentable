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
 * **A failed read running again is still the failed read, now trying.** The query client puts a
 * read that holds nothing back to pending while it runs, so it no longer reads as errored and
 * would be drawn as loading: the failed block, and the *try again* the reader just pressed, would
 * go, and the keyboard focus with them. So a read that holds nothing, whose last answer was an
 * error and which is running is failed and retrying, and the failed block stays with its *try
 * again* busy until the read answers. *Its last answer*, not *it has ever failed*: a read that
 * failed once and answered since is loading when it runs again, not a failure.
 *
 * **A surface drawn from more than one read fails with any of them.** What it would draw from the
 * reads that answered, without the one that failed, says something false: a workspace page whose
 * members could not be read would say nobody holds it. So {@link toReadsFailure} makes one
 * failure of several, and its *try again* runs each read that failed, never one that answered.
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
	/** Whether a run of the read is in flight. */
	readonly isFetching: boolean;
	/** When the read last errored, or 0; kept while it runs again. */
	readonly errorUpdatedAt: number;
	/** When the read last answered, or 0. */
	readonly dataUpdatedAt: number;
	/** What the read holds, or `undefined` where it holds nothing yet. */
	readonly data: unknown;
	/** Run the read again. */
	refetch: () => unknown;
};

/** What a surface draws from a read: whether it failed, and what runs it again. */
export type ReadFailure = {
	/** Whether the read failed with nothing to show, so the surface draws the failed state. */
	failed: boolean;
	/** Whether the failed read is running again, so its *try again* is busy. */
	retrying: boolean;
	/** Run the read again: the failed state's *try again*. */
	retry: () => void;
};

/** Whether `query` failed, whether it is running again, and how to run it again. */
export function toReadFailure(query: ReadResult): ReadFailure {
	const holdsNothing = query.data === undefined;
	const retrying = holdsNothing && query.isFetching && query.errorUpdatedAt > query.dataUpdatedAt;

	return {
		failed: holdsNothing && (query.isError || retrying),
		retrying,
		retry: () => void query.refetch()
	};
}

/**
 * One failure of the several reads a surface draws from: failed while any of them failed, retrying
 * while any that failed runs again, and trying again runs each read that failed, never one that
 * answered, whose answer stands. Each read is decided by {@link toReadFailure} first.
 */
export function toReadsFailure(...reads: ReadFailure[]): ReadFailure {
	return {
		failed: reads.some((read) => read.failed),
		retrying: reads.some((read) => read.retrying),
		retry: () => {
			for (const read of reads) if (read.failed) read.retry();
		}
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
