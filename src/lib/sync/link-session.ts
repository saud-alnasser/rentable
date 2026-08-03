import type { GoogleDriveLinkPreparation } from '$lib/platform/tauri';

/** the link operation the flow drives, injected so the sequence can be exercised without one. */
export type LinkSessionDriver = {
	/**
	 * run a whole link. `onAuthorized` is called once the consent screen has been
	 * answered, which is the only thing that happens between the call and its
	 * result that the user can see.
	 */
	link: (onAuthorized: () => void) => Promise<GoogleDriveLinkPreparation>;
	/** abandon whatever is outstanding, and undo a link already recorded. */
	cancel: () => Promise<void>;
	isCancellation: (error: unknown) => boolean;
};

/**
 * what a consumer does with each outcome. The link is identical wherever it is
 * offered; what follows each outcome is not — startup drives its own state
 * machine, and settings goes through mutations and toasts.
 */
export type LinkSessionHandlers = {
	/** the linked state, as soon as it is known and before any resolution. */
	onState?: (state: GoogleDriveLinkPreparation['state']) => void | Promise<void>;
	/** the two sides disagree and only the user can choose. Nothing transfers until they do. */
	onResolutionRequired?: (preparation: GoogleDriveLinkPreparation) => void | Promise<void>;
	/** carry out a link that needs no decision. */
	resolve: (preparation: GoogleDriveLinkPreparation) => Promise<void>;
	onFailure?: (error: unknown) => void | Promise<void>;
	onCancelled?: () => void | Promise<void>;
};

/**
 * The link, start to finish, owned in one place.
 *
 * Authorization happens in a browser the application does not control, so an
 * attempt is outstanding for as long as the user takes — during which they may
 * start another, or abandon this one. Two things follow, and both are the reason
 * this is not inline in a component: a result arriving for an attempt that has
 * been replaced is discarded rather than applied, and cancelling has to settle
 * the remote as well as the local state.
 *
 * Holds no reactivity of its own; {@link LinkSessionFlow.observe} notifies a wrapper that does.
 */
export class LinkSessionFlow {
	#driver: LinkSessionDriver;
	#handlers: LinkSessionHandlers;
	#observers = new Set<() => void>();

	/**
	 * which attempt is current. Nothing but the newest may write, and a number is
	 * enough to say which that is now that the caller holds no session of its own.
	 */
	#attempt = 0;
	#isAuthorizing = false;
	#isFinalizing = false;
	#watching: Promise<void> = Promise.resolve();

	constructor(driver: LinkSessionDriver, handlers: LinkSessionHandlers) {
		this.#driver = driver;
		this.#handlers = handlers;
	}

	/** the consent screen is open and the user has not answered it yet. */
	get isAuthorizing() {
		return this.#isAuthorizing;
	}

	/** the user has answered, and the result is being applied. */
	get isFinalizing() {
		return this.#isFinalizing;
	}

	/** true while authorization is outstanding or its result is being applied. */
	get isLinking() {
		return this.#isAuthorizing || this.#isFinalizing;
	}

	/** register a listener called after every state change. Returns its own removal. */
	observe(observer: () => void) {
		this.#observers.add(observer);
		return () => this.#observers.delete(observer);
	}

	/** resolves once the attempt being watched has finished, however it finished. */
	settled() {
		return this.#watching;
	}

	/** begin authorization and watch it through to its outcome. */
	begin() {
		const attempt = ++this.#attempt;

		this.#isAuthorizing = true;
		this.#isFinalizing = false;
		this.#notify();
		this.#watching = this.#watch(attempt);
	}

	/**
	 * abandon whatever is outstanding. The local state is cleared first and
	 * unconditionally, so a remote that refuses the cancellation cannot strand the
	 * interface waiting on an attempt nobody is going to finish.
	 */
	async cancel() {
		const wasLinking = this.isLinking;

		this.#attempt += 1;
		this.#isAuthorizing = false;
		this.#isFinalizing = false;
		this.#notify();

		if (!wasLinking) {
			return;
		}

		await this.#driver.cancel().catch(() => undefined);
		await this.#handlers.onCancelled?.();
	}

	async #watch(attempt: number) {
		try {
			const preparation = await this.#driver.link(() => this.#authorized(attempt));

			if (!this.#isCurrent(attempt)) {
				return;
			}

			await this.#handlers.onState?.(preparation.state);

			if (preparation.requiresResolution) {
				this.#settle(attempt);
				await this.#handlers.onResolutionRequired?.(preparation);
				return;
			}

			await this.#handlers.resolve(preparation);
		} catch (error) {
			if (!this.#isCurrent(attempt)) {
				return;
			}

			this.#settle(attempt);

			if (!this.#driver.isCancellation(error)) {
				await this.#handlers.onFailure?.(error);
			}
		} finally {
			this.#settle(attempt);
		}
	}

	#authorized(attempt: number) {
		if (!this.#isCurrent(attempt)) {
			return;
		}

		this.#isAuthorizing = false;
		this.#isFinalizing = true;
		this.#notify();
	}

	#settle(attempt: number) {
		if (!this.#isCurrent(attempt)) {
			return;
		}

		this.#isAuthorizing = false;
		this.#isFinalizing = false;
		this.#notify();
	}

	#isCurrent(attempt: number) {
		return this.#attempt === attempt;
	}

	#notify() {
		for (const observer of this.#observers) {
			observer();
		}
	}
}
