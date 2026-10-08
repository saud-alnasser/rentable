import { toUtcDay } from '$lib/date';
import type { StartupPorts } from './ports';

/**
 * The whole-table passes a running application owes: the one the date owes when it crosses a UTC
 * day, and the one a pull that brought rows owes before it announces them.
 *
 * **One guard for both.** Each is a whole-table reconcile and two at once is one of them wasted,
 * so they share the flag that says one is out, and rows that land while one is out are announced
 * once it is back rather than dropped.
 */
export class Reconciliation {
	#ports: StartupPorts;
	/** whether a newer rentable holds the session read-only, or past reading, by its version. */
	#isHeldByVersion: () => boolean;

	#isReconcilingDayCrossing = false;
	#receivedWhileReconciling = false;
	#lastReconciledUtcDay: number;

	constructor(ports: StartupPorts, isHeldByVersion: () => boolean) {
		this.#ports = ports;
		this.#isHeldByVersion = isHeldByVersion;
		this.#lastReconciledUtcDay = toUtcDay(ports.now()).getTime();
	}

	/** a reconcile finished, and the day it reconciled on is the one a crossing is measured from. */
	settle(reconciledAt: number) {
		this.#lastReconciledUtcDay = toUtcDay(reconciledAt).getTime();
	}

	/**
	 * A pull landed rows.
	 *
	 * Rows that land while a day-crossing pass is out are announced once it is back, rather than
	 * dropped: that pass started before they arrived and may have read the tables first, and the
	 * query cache is `staleTime: Infinity`, so a pull nobody announced is rows the screen never
	 * shows. Both passes are whole-table, which is why they do not overlap.
	 */
	async received() {
		if (this.#isReconcilingDayCrossing) {
			this.#receivedWhileReconciling = true;

			return;
		}

		await this.#announceReceived();
	}

	/** the whole-table pass a pull that brought rows owes, and the announcement after it. */
	async #announceReceived() {
		this.#isReconcilingDayCrossing = true;

		try {
			this.settle(await this.#ports.workspace.announceReceived());
		} finally {
			this.#isReconcilingDayCrossing = false;
		}

		if (this.#receivedWhileReconciling) {
			this.#receivedWhileReconciling = false;
			await this.#announceReceived();
		}
	}

	/**
	 * Recompute what the date decides, where the date has moved under a running application.
	 *
	 * Derived state moves only at UTC day boundaries, so an application left running crosses into
	 * wrong statuses at midnight UTC. Comparing calendar days on every tick, rather than counting
	 * elapsed ticks, keeps the check correct across sleep and wake.
	 *
	 * **Nothing while the version holds the session** (effort 857, requirement 9): the pass writes
	 * the derived columns, and a newer rentable upgraded what it would write past what this one
	 * may. The machines that write it keep the statuses current, and this one reads what they wrote.
	 */
	async onDayCrossing(isReady: boolean) {
		if (!isReady || this.#isReconcilingDayCrossing || this.#isHeldByVersion()) {
			return;
		}

		if (toUtcDay(this.#ports.now()).getTime() === this.#lastReconciledUtcDay) {
			return;
		}

		this.#isReconcilingDayCrossing = true;

		try {
			const { reconciledAt } = await this.#ports.workspace.reconcile();
			this.settle(reconciledAt);
			await this.#ports.cache.invalidateAll();
		} catch {
			/* the next tick retries */
		} finally {
			this.#isReconcilingDayCrossing = false;
		}

		// a pull that brought rows while this pass was out is owed its announcement.
		if (this.#receivedWhileReconciling) {
			this.#receivedWhileReconciling = false;
			await this.#announceReceived();
		}
	}
}
