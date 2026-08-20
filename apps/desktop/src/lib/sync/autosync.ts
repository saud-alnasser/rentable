import { tauri } from '$lib/platform/tauri';
import {
	emitWorkspaceSyncResult,
	listenForWorkspaceSyncRequests,
	type WorkspaceSyncRequest,
	type WorkspaceSyncEventResult
} from '$lib/sync/event';
import { syncWorkspaceNow } from '$lib/sync/workspace';
import { toErrorText } from '$lib/error/message';
import { toTauriErrorCode } from '$lib/error/tauri';
import { LL } from '$lib/i18n/i18n-svelte';
import { get } from 'svelte/store';

const SYNC_DEBOUNCE_MS = 20_000;
const INITIAL_RETRY_MS = 15_000;
const MAX_RETRY_MS = 15 * 60_000;

/**
 * how often a machine that is doing nothing at all still reaches the workspace.
 *
 * **Without it, replication is edge-triggered on this machine's own activity**, and one of the two
 * directions has no edge to ride: a device whose user is reading rather than writing has no
 * mutation, no reconnection and no reason to pull, so another device's work would not arrive until
 * somebody here typed something. Five minutes is well inside requirement 15's three-day window, so
 * it also keeps the session renewed on a machine nobody touches.
 */
const HEARTBEAT_MS = 5 * 60_000;

/**
 * the failures no amount of waiting settles. Each ends when someone acts, not when a retry
 * succeeds.
 *
 * *It named four Drive failures — the account needing to be linked again, a file this
 * application may not write, bytes disagreeing with the index, and another machine holding the
 * workspace. What reaches here now is the control-plane reach, and a refusal from it is
 * `preconditionFailed`: the session was declined rather than missed, and retrying against a
 * decision is how a client asks the same question forever.*
 */
const SETTLED_WITHOUT_RETRY = new Set(['preconditionFailed', 'forbidden', 'busy']);

function shouldRetryAfter(error: unknown) {
	const code = toTauriErrorCode(error);
	return code === null || !SETTLED_WITHOUT_RETRY.has(code);
}

/**
 * keep this machine's window open, on a timer and whenever the network comes back.
 *
 * **This was the Drive autosync manager and it schedules the same way**, because what it
 * schedules is the same shape: work that must be coalesced, must not overlap itself, and must
 * be retried on a widening delay while the reason for failing is one that time can settle.
 * **What it dispatches is the reach at the control plane that renews the session, and since #617
 * the replica's push and pull as well.** It read "no longer a push — a replica pushes its own
 * writes", which described a library that does not exist: `turso::sync` holds every write until
 * something calls `push`. This manager is where that call belongs, because the middleware feeding
 * it already declares which procedures are mutations and this already coalesces them, retries on a
 * widening delay, and fires when the network comes back.
 */
export function startWorkspaceSyncManager(input: {
	onResult?: (detail: WorkspaceSyncEventResult) => Promise<void> | void;
}) {
	let timer: number | null = null;
	let isRunning = false;
	let shouldRunAgain = false;
	let retryDelayMs = INITIAL_RETRY_MS;

	const schedule = (request: WorkspaceSyncRequest = {}) => {
		if (timer !== null) {
			window.clearTimeout(timer);
		}

		timer = window.setTimeout(() => void run(), request.immediate ? 0 : SYNC_DEBOUNCE_MS);
	};

	const handleResult = async (detail: WorkspaceSyncEventResult) => {
		emitWorkspaceSyncResult(detail);
		await input.onResult?.(detail);
	};

	const run = async () => {
		if (timer !== null) {
			window.clearTimeout(timer);
			timer = null;
		}

		if (isRunning) {
			shouldRunAgain = true;
			return;
		}

		isRunning = true;

		try {
			const result = await syncWorkspaceNow();
			await handleResult({
				action: result.action,
				errorMessage: null,
				received: result.received
			});

			// **A push that did not go arms the ladder**, which nothing else would: a replication
			// that could not reach the remote is reported rather than thrown, so the `catch` below
			// never sees it. Without this the only things that ever push again are the next
			// mutation and the next launch, and a machine on a network with no upstream would hold
			// a payment until its owner happened to write something else.
			if (!result.pushed) {
				const nextDelay = retryDelayMs;
				retryDelayMs = Math.min(retryDelayMs * 2, MAX_RETRY_MS);
				timer = window.setTimeout(() => void run(), nextDelay);

				return;
			}

			retryDelayMs = INITIAL_RETRY_MS;
		} catch (error) {
			const message = toErrorText(error, get(LL));
			await tauri.remoteSync.getState().catch(() => null);
			await handleResult({ action: 'error', errorMessage: message, received: false });

			if (shouldRetryAfter(error)) {
				const nextDelay = retryDelayMs;
				retryDelayMs = Math.min(retryDelayMs * 2, MAX_RETRY_MS);
				timer = window.setTimeout(() => void run(), nextDelay);
			}
		} finally {
			isRunning = false;

			if (shouldRunAgain) {
				shouldRunAgain = false;
				schedule({ immediate: false, reason: 'coalesced' });
			}
		}
	};

	const stopListeningForRequests = listenForWorkspaceSyncRequests((detail) => schedule(detail));
	const handleOnline = () => schedule({ immediate: true, reason: 'online' });
	window.addEventListener('online', handleOnline);

	// **The one trigger that is not this machine's own activity.** Everything else here rides an
	// edge somebody on this device produced — a mutation, a reconnection, a launch — and a device
	// whose user is reading has none of them. `run` coalesces against itself, so a heartbeat landing
	// on a dispatch already in flight is dropped rather than queued behind it.
	const heartbeat = window.setInterval(() => void run(), HEARTBEAT_MS);

	return () => {
		stopListeningForRequests();
		window.removeEventListener('online', handleOnline);
		window.clearInterval(heartbeat);
		if (timer !== null) {
			window.clearTimeout(timer);
		}
	};
}
