import { createSubscriber } from 'svelte/reactivity';

/**
 * WHETHER A REPLICATION IS RUNNING NOW
 *
 * `RemoteSyncState` is what the shell holds between runs and carries no in-flight fact, so the
 * sync group's *syncing* (effort 846, requirement 12) is counted here, at the one place every run
 * passes: `syncWorkspaceNow` (`sync/workspace.ts`), which the sync control's mutation, the sync
 * manager's timer and retries, and startup's first run all call.
 *
 * **A count rather than a flag**, because the control and the manager can each have a run out at
 * once, and the first to finish must not say nothing is running while the other still is.
 *
 * **Svelte's subscriber rather than `$state`**, because `sync/workspace.ts` loads under Node,
 * where its tests run, and a rune is only defined where the Svelte compiler has been. A component
 * reading `syncActivity.inFlight` is told when it changes; a Node caller reads the plain count.
 */
let running = 0;

// what tells the readers the count moved. Svelte calls the start once, when the first reader
// subscribes, and the one update it hands over reaches every reader; it is gone again when the
// last one leaves.
let update: (() => void) | null = null;

const subscribe = createSubscriber((next) => {
	update = next;

	return () => {
		update = null;
	};
});

const changed = () => update?.();

export const syncActivity = {
	/** whether any replication is out now. */
	get inFlight() {
		subscribe();

		return running > 0;
	}
};

/** run one replication, counted for as long as it is out, however it ends. */
export async function countRun<T>(run: () => Promise<T>): Promise<T> {
	running += 1;
	changed();

	try {
		return await run();
	} finally {
		running -= 1;
		changed();
	}
}
