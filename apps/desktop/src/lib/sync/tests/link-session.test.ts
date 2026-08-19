import assert from 'node:assert/strict';
import test from 'node:test';

import type { GoogleDriveLinkPreparation, RemoteSyncState } from '$lib/platform/host.ts';
import { fakeSyncState } from '$lib/platform/tests/testing.ts';

import {
	LinkSessionFlow,
	type LinkSessionDriver,
	type LinkSessionHandlers
} from '../link-session.ts';

const STATE = fakeSyncState();

function preparation(
	overrides: Partial<GoogleDriveLinkPreparation> = {}
): GoogleDriveLinkPreparation {
	return {
		state: STATE,
		requiresResolution: false,
		recommendedMode: 'push',
		conflict: null,
		...overrides
	};
}

class Cancellation extends Error {}

/** let every already-settled continuation run, without waiting on one that never settles. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** what the driver was asked for, counted. */
type DriverCalls = { link: number; cancel: number };

/** a driver whose every step is settled by the test, so ordering is exercised rather than timing. */
function createDriver(
	overrides: Partial<LinkSessionDriver> = {}
): LinkSessionDriver & { calls: DriverCalls } {
	const calls: DriverCalls = { link: 0, cancel: 0 };

	return {
		calls,
		link: async () => {
			calls.link += 1;
			return preparation();
		},
		cancel: async () => {
			calls.cancel += 1;
		},
		isCancellation: (error) => error instanceof Cancellation,
		...overrides
	};
}

/** what each handler was handed, in the order it was handed over. */
type HandlerRecord = {
	state: RemoteSyncState[];
	resolutionRequired: GoogleDriveLinkPreparation[];
	resolved: GoogleDriveLinkPreparation[];
	failure: unknown[];
	cancelled: number;
};

function createHandlers(
	overrides: Partial<LinkSessionHandlers> = {}
): LinkSessionHandlers & { seen: HandlerRecord } {
	const seen: HandlerRecord = {
		state: [],
		resolutionRequired: [],
		resolved: [],
		failure: [],
		cancelled: 0
	};

	return {
		seen,
		onState: (state) => {
			seen.state.push(state);
		},
		onResolutionRequired: (value) => {
			seen.resolutionRequired.push(value);
		},
		resolve: async (value) => {
			seen.resolved.push(value);
		},
		onFailure: (error) => {
			seen.failure.push(error);
		},
		onCancelled: () => {
			seen.cancelled += 1;
		},
		...overrides
	};
}

// --- The ordinary path ----------------------------------------------------------------

test('a link that completes without a conflict resolves and leaves nothing pending', async () => {
	const driver = createDriver();
	const handlers = createHandlers();
	const flow = new LinkSessionFlow(driver, handlers);

	flow.begin();
	await flow.settled();

	assert.equal(driver.calls.link, 1);
	assert.deepEqual(handlers.seen.state, [STATE]);
	assert.equal(handlers.seen.resolved.length, 1);
	assert.equal(handlers.seen.resolutionRequired.length, 0);
	assert.equal(flow.isLinking, false);
	assert.equal(flow.isFinalizing, false);
});

test('a link needing a conflict decision stops and holds the preparation', async () => {
	const prepared = preparation({ requiresResolution: true, recommendedMode: 'pull' });
	const driver = createDriver({ link: async () => prepared });
	const handlers = createHandlers();
	const flow = new LinkSessionFlow(driver, handlers);

	flow.begin();
	await flow.settled();

	assert.deepEqual(handlers.seen.resolutionRequired, [prepared]);
	assert.equal(handlers.seen.resolved.length, 0, 'nothing is resolved without the user');
	assert.equal(flow.isLinking, false, 'the attempt is over; the decision outlives it');
});

// --- Cancellation ---------------------------------------------------------------------

test('cancelling in flight cancels the attempt remotely and clears what was pending', async () => {
	const driver = createDriver({ link: () => new Promise(() => {}) });
	const handlers = createHandlers();
	const flow = new LinkSessionFlow(driver, handlers);

	flow.begin();
	await flow.cancel();

	assert.equal(driver.calls.cancel, 1);
	assert.equal(handlers.seen.cancelled, 1);
	assert.equal(flow.isLinking, false);
});

test('cancelling with nothing in flight asks the remote for nothing', async () => {
	const driver = createDriver();
	const handlers = createHandlers();
	const flow = new LinkSessionFlow(driver, handlers);

	await flow.cancel();

	assert.equal(driver.calls.cancel, 0);
	assert.equal(handlers.seen.cancelled, 0);
});

// a remote that refuses the cancellation must not strand the local state, which is the
// whole reason the call is allowed to fail.
test('a cancellation the remote refuses still clears the local state', async () => {
	const driver = createDriver({
		link: () => new Promise(() => {}),
		cancel: async () => {
			throw new Error('the remote refused');
		}
	});
	const handlers = createHandlers();
	const flow = new LinkSessionFlow(driver, handlers);

	flow.begin();
	await flow.cancel();

	assert.equal(flow.isLinking, false);
	assert.equal(handlers.seen.cancelled, 1);
});

test('a cancellation raised by the driver is not reported as a failure', async () => {
	const driver = createDriver({
		link: async () => {
			throw new Cancellation('the user closed the window');
		}
	});
	const handlers = createHandlers();
	const flow = new LinkSessionFlow(driver, handlers);

	flow.begin();
	await flow.settled();

	assert.deepEqual(handlers.seen.failure, []);
	assert.equal(flow.isLinking, false);
});

test('a failure that is not a cancellation is reported', async () => {
	const failure = new Error('the network went away');
	const driver = createDriver({
		link: async () => {
			throw failure;
		}
	});
	const handlers = createHandlers();
	const flow = new LinkSessionFlow(driver, handlers);

	flow.begin();
	await flow.settled();

	assert.deepEqual(handlers.seen.failure, [failure]);
	assert.equal(flow.isLinking, false);
});

// --- Supersession ---------------------------------------------------------------------

/** one attempt's outstanding link, and the handles the test settles it through. */
type PendingLink = {
	settle: (preparation: GoogleDriveLinkPreparation) => void;
	onAuthorized: () => void;
};

/** a driver handing each attempt its own pending link, so one can be settled alone. */
function createSupersedingDriver(): LinkSessionDriver & { pending: PendingLink[] } {
	const pending: PendingLink[] = [];

	return {
		pending,
		link: (onAuthorized) =>
			new Promise<GoogleDriveLinkPreparation>((resolve) => {
				pending.push({ settle: resolve, onAuthorized });
			}),
		cancel: async () => {},
		isCancellation: (error) => error instanceof Cancellation
	};
}

// the guard both components hand-rolled: an attempt that finishes after the user started
// another must not write its result over the one that replaced it.
test('a superseded attempt finishing late changes nothing', async () => {
	const driver = createSupersedingDriver();
	const handlers = createHandlers();
	const flow = new LinkSessionFlow(driver, handlers);

	flow.begin();
	flow.begin();
	driver.pending[0].settle(preparation());
	// the replacement is still outstanding by design, so there is no promise to await
	// here — only the superseded one's continuation has to run.
	await flush();

	assert.deepEqual(handlers.seen.state, [], 'the late result is discarded');
	assert.equal(handlers.seen.resolved.length, 0);
	assert.equal(flow.isLinking, true, 'the replacement still stands');
});

test('finalizing is only raised for the attempt that is still current', async () => {
	const driver = createSupersedingDriver();
	const flow = new LinkSessionFlow(driver, createHandlers());

	flow.begin();
	flow.begin();
	driver.pending[0].onAuthorized();

	assert.equal(flow.isFinalizing, false);
});

test('finalizing is raised when the current attempt is authorized', async () => {
	const driver = createSupersedingDriver();
	const flow = new LinkSessionFlow(driver, createHandlers());

	flow.begin();
	driver.pending[0].onAuthorized();

	assert.equal(flow.isFinalizing, true);
	assert.equal(flow.isAuthorizing, false);
});

// --- Observers ------------------------------------------------------------------------

test('every state change notifies the observer', async () => {
	const driver = createDriver();
	const flow = new LinkSessionFlow(driver, createHandlers());
	let notifications = 0;
	flow.observe(() => {
		notifications += 1;
	});

	flow.begin();
	await flow.settled();

	assert.ok(notifications > 0, 'the reactive wrapper has something to mirror');
});
