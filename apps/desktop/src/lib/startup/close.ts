import type { StartupMachine } from './machine';

/**
 * The window close that syncs first.
 *
 * Its own because it holds the two latches a close runs under, one while the push is out and one
 * once the close itself is past interrupting, and nothing else in the unit reads either.
 */
export class WindowClose {
	#machine: StartupMachine;

	#isSyncingWindowClose = false;
	#isFinalizingWindowClose = false;

	constructor(machine: StartupMachine) {
		this.#machine = machine;
	}

	/**
	 * Hide the window, push what this machine holds, then close.
	 *
	 * Hiding first is what makes the sync feel free: the window is gone by the time it runs, so a
	 * slow push looks like an application that closed rather than one that hung on the way out.
	 */
	async close(skipSync = false) {
		if (this.#isFinalizingWindowClose) {
			return;
		}

		if (!skipSync && this.#isSyncingWindowClose) {
			return;
		}

		if (!skipSync) {
			this.#isSyncingWindowClose = true;
		}

		const machine = this.#machine;

		try {
			await machine.ports.window.hide();

			if (!skipSync && machine.current.state === 'ready') {
				machine.set({
					remoteSync: (await machine.ports.workspace.syncBeforeExit(machine.current.remoteSync))
						.state
				});
			}
		} catch {
			/* ignore close sync failures */
		} finally {
			this.#isSyncingWindowClose = false;
			this.#isFinalizingWindowClose = true;

			try {
				await machine.ports.window.close();
			} catch {
				this.#isFinalizingWindowClose = false;
			}
		}
	}

	/** whether a close is already past the point of being interrupted. */
	get isClosing() {
		return this.#isFinalizingWindowClose;
	}
}
