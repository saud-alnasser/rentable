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
	standing: 'held'
};

let requested: ((detail: { immediate?: boolean }) => void) | null = null;

mock.module('$lib/sync/workspace', {
	exports: {
		syncWorkspaceNow: async () => dispatched
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

mock.module('$lib/platform/tauri', {
	exports: { tauri: { remoteSync: { getState: async () => dispatched.state } } }
});

const { startWorkspaceSyncManager } = await import('$lib/sync/autosync');

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
