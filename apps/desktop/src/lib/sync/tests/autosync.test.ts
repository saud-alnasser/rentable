import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

import type { WorkspaceSyncResult } from '$lib/sync/workspace.ts';

/**
 * THE SYNC MANAGER
 *
 * What the thing that runs when nobody is doing anything does with what one dispatch answered.
 *
 * **It is here for the one answer the dispatch carries that is not about the workspace** (effort
 * 826, requirement 22): a replication whose standing is `signedOutElsewhere` means somebody ended
 * this member's sessions from another machine and the shell has already put the wall up on its
 * side, so this manager reports nothing about a workspace nobody is signed in to and says instead
 * that the session ended. The route wires that to `startup.standingChanged()`, which reads where
 * the machine stands and raises the wall.
 *
 * **The window is stood in for rather than rendered.** This manager schedules with
 * `window.setTimeout` and `window.setInterval` and listens for `online`; a `node:test` process has
 * none of them, and what is under test is which callback it reaches for rather than any DOM. The
 * three functions it actually calls are supplied, the timers never fire on their own, and every
 * run in these tests is the immediate one a request asks for.
 */

type Timer = { id: number; run: () => void };

const timers: Timer[] = [];
let nextTimerId = 1;

const fakeWindow = {
	setTimeout: (run: () => void) => {
		const id = nextTimerId++;
		timers.push({ id, run });

		return id;
	},
	clearTimeout: (id: number) => {
		const at = timers.findIndex((timer) => timer.id === id);

		if (at >= 0) timers.splice(at, 1);
	},
	setInterval: () => nextTimerId++,
	clearInterval: () => {},
	addEventListener: () => {},
	removeEventListener: () => {}
};

(globalThis as unknown as { window: typeof fakeWindow }).window = fakeWindow;

/** run whatever is scheduled, the way a timer firing would. */
const fire = async () => {
	const scheduled = timers.splice(0, timers.length);

	for (const timer of scheduled) {
		timer.run();
	}

	// the dispatch and everything it awaits.
	await new Promise((resolve) => setImmediate(resolve));
	await new Promise((resolve) => setImmediate(resolve));
};

let dispatched: WorkspaceSyncResult = {
	state: { workspace: { remoteId: 'north' } } as unknown as WorkspaceSyncResult['state'],
	action: 'none',
	received: false,
	pushed: true,
	refusal: 'none',
	standing: 'held',
	heldByVersion: null
};

/** what the next dispatch throws instead of answering, where a test says so. */
let throws: unknown = null;

let requested: ((detail: { immediate?: boolean }) => void) | null = null;

mock.module('$lib/sync/workspace', {
	exports: {
		syncWorkspaceNow: async () => {
			if (throws) throw throws;

			return dispatched;
		}
	}
});

mock.module('$lib/sync/event', {
	exports: {
		emitWorkspaceSyncResult: () => {},
		listenForWorkspaceSyncRequests: (listener: (detail: { immediate?: boolean }) => void) => {
			requested = listener;

			return () => {
				requested = null;
			};
		}
	}
});

mock.module('$lib/sync/tauri', {
	exports: { tauri: { getState: async () => dispatched.state } }
});

const { startWorkspaceSyncManager } = await import('$lib/sync/autosync');
type Reported = Parameters<
	NonNullable<Parameters<typeof startWorkspaceSyncManager>[0]['onResult']>
>[0];

/** one manager, one dispatch asked for immediately, and every outcome it reported, whole. */
async function reported(answer: Partial<WorkspaceSyncResult>, thrown: unknown = null) {
	const outcomes: Reported[] = [];

	dispatched = { ...dispatched, standing: 'held', heldByVersion: null, ...answer };
	throws = thrown;
	timers.length = 0;

	const stop = startWorkspaceSyncManager({
		onResult: (detail) => {
			outcomes.push(detail);
		}
	});

	requested?.({ immediate: true });
	await fire();
	stop();
	throws = null;

	return outcomes;
}

/** one manager, one dispatch asked for immediately, and what each callback was handed. */
async function oneDispatch(standing: WorkspaceSyncResult['standing']) {
	const results: string[] = [];
	const ended: string[] = [];

	dispatched = { ...dispatched, standing };
	timers.length = 0;

	const stop = startWorkspaceSyncManager({
		onResult: (detail) => {
			results.push(detail.action);
		},
		onSessionEnded: () => {
			ended.push('ended');
		}
	});

	requested?.({ immediate: true });
	await fire();
	stop();

	return { results, ended };
}

// requirement 22: the heartbeat is what a machine nobody is touching runs, so it is what notices,
// and what it owes the shell is one call.
test('a dispatch answering that the session was ended elsewhere says so and reports no workspace outcome', async () => {
	const { results, ended } = await oneDispatch('signedOutElsewhere');

	assert.deepEqual(ended, ['ended'], 'the manager did not say the session ended');
	assert.deepEqual(results, [], 'a workspace outcome was reported for a session that is gone');
});

test('an ordinary dispatch reports its outcome and says nothing about the session', async () => {
	const { results, ended } = await oneDispatch('held');

	assert.deepEqual(results, ['none']);
	assert.deepEqual(ended, []);
});

// effort 857, ticket 12: what the shell judged after the pull reaches startup as it was judged,
// so a raise moves the application rather than becoming a line of text nobody routes on.
test('a dispatch that pulled a raise reports the verdict on its outcome', async () => {
	const heldByVersion = {
		target: { workspace: 'north' },
		standing: 'readOnly' as const,
		reason: 'a newer version of rentable upgraded North Properties'
	};
	const [outcome] = await reported({ heldByVersion, received: true });

	assert.deepEqual(outcome?.heldByVersion, heldByVersion);
	assert.equal(outcome?.refusal, null);
	assert.equal(outcome?.received, true);
});

test('and a dispatch the shell refused carries the refusal code, not only its sentence', async () => {
	const [outcome] = await reported(
		{},
		{ code: 'refused', reason: 'workspaceNewer', message: 'upgraded past this version' }
	);

	assert.equal(outcome?.action, 'error');
	assert.equal(outcome?.refusal, 'workspaceNewer');
	assert.equal(outcome?.heldByVersion, null);
});
