import type { GoogleDriveLinkSessionResult } from '$lib/api/tauri';
import type {
	GoogleDriveLinkPreparation,
	GoogleDrivePendingLinkSession
} from '$lib/api/utils/remote-sync-google-drive';

type FinishOptions = {
	signal?: AbortSignal;
	onResult?: (result: GoogleDriveLinkSessionResult) => void;
};

/** the Drive operations the flow needs, injected so the sequence can be exercised without one. */
export type LinkSessionDriver = {
	start: () => Promise<GoogleDrivePendingLinkSession>;
	finish: (
		session: GoogleDrivePendingLinkSession,
		options: FinishOptions
	) => Promise<GoogleDriveLinkPreparation>;
	cancel: (session: Pick<GoogleDrivePendingLinkSession, 'sessionId'>) => Promise<void>;
	isCancellation: (error: unknown) => boolean;
};

/**
 * what a consumer does with each outcome. The sequence is identical wherever linking is
 * offered; what follows each outcome is not — startup drives its own state machine, and
 * settings goes through mutations and toasts.
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
 * The link session, start to finish, owned in one place.
 *
 * Authorization happens in a browser the application does not control, so a session is
 * outstanding for as long as the user takes — during which they may start another, or
 * abandon this one. Two things follow, and both are the reason this is not inline in a
 * component: a result arriving for a session that is no longer the current one is
 * discarded rather than applied, and cancelling has to settle the remote session as well
 * as the local state.
 *
 * Holds no reactivity of its own; {@link LinkSessionFlow.observe} notifies a wrapper that does.
 */
export class LinkSessionFlow {
	#driver: LinkSessionDriver;
	#handlers: LinkSessionHandlers;
	#observers = new Set<() => void>();

	#session: GoogleDrivePendingLinkSession | null = null;
	#isFinalizing = false;
	#abortController: AbortController | null = null;
	#watching: Promise<void> = Promise.resolve();

	constructor(driver: LinkSessionDriver, handlers: LinkSessionHandlers) {
		this.#driver = driver;
		this.#handlers = handlers;
	}

	get session() {
		return this.#session;
	}

	get isFinalizing() {
		return this.#isFinalizing;
	}

	/** register a listener called after every state change. Returns its own removal. */
	observe(observer: () => void) {
		this.#observers.add(observer);
		return () => this.#observers.delete(observer);
	}

	/** resolves once the session being watched has finished, however it finished. */
	settled() {
		return this.#watching;
	}

	/** begin authorization and watch it through to its outcome. */
	async begin() {
		this.#isFinalizing = false;
		this.#notify();

		const session = await this.#driver.start();
		this.#session = session;
		this.#notify();
		this.#watching = this.#watch(session);
	}

	/**
	 * abandon whatever is outstanding. The local state is cleared first and unconditionally,
	 * so a remote that refuses the cancellation cannot strand the interface waiting on a
	 * session nobody is going to finish.
	 */
	async cancel() {
		const session = this.#session;

		this.#abortController?.abort();
		this.#abortController = null;
		this.#session = null;
		this.#isFinalizing = false;
		this.#notify();

		if (!session) {
			return;
		}

		await this.#driver.cancel(session).catch(() => undefined);
		await this.#handlers.onCancelled?.();
	}

	async #watch(session: GoogleDrivePendingLinkSession) {
		const abortController = new AbortController();
		this.#abortController = abortController;

		try {
			const preparation = await this.#driver.finish(session, {
				signal: abortController.signal,
				onResult: (result) => {
					if (result.status === 'completed' && this.#isCurrent(session)) {
						this.#isFinalizing = true;
						this.#notify();
					}
				}
			});

			if (!this.#isCurrent(session)) {
				return;
			}

			await this.#handlers.onState?.(preparation.state);

			if (preparation.requiresResolution) {
				this.#isFinalizing = false;
				this.#notify();
				await this.#handlers.onResolutionRequired?.(preparation);
				return;
			}

			await this.#handlers.resolve(preparation);
		} catch (error) {
			this.#isFinalizing = false;
			this.#notify();

			if (!this.#driver.isCancellation(error)) {
				await this.#handlers.onFailure?.(error);
			}
		} finally {
			this.#isFinalizing = false;

			if (this.#isCurrent(session)) {
				this.#session = null;
			}

			if (this.#abortController === abortController) {
				this.#abortController = null;
			}

			this.#notify();
		}
	}

	#isCurrent(session: GoogleDrivePendingLinkSession) {
		return this.#session?.sessionId === session.sessionId;
	}

	#notify() {
		for (const observer of this.#observers) {
			observer();
		}
	}
}
