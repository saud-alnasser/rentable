import assert from 'node:assert/strict';
import test from 'node:test';

import { LinkSessionFlow } from './link-session.ts';

const SESSION = { sessionId: 'session-1', authorizationUrl: 'https://example.invalid/auth' };
const OTHER_SESSION = { sessionId: 'session-2', authorizationUrl: 'https://example.invalid/auth' };

const STATE = { accounts: [], workspaces: [] };

function preparation(overrides = {}) {
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

/** a driver whose every step is settled by the test, so ordering is exercised rather than timing. */
function createDriver(overrides = {}) {
	const calls = { start: 0, finish: 0, cancel: [] };

	return {
		calls,
		start: async () => {
			calls.start += 1;
			return SESSION;
		},
		finish: async () => {
			calls.finish += 1;
			return preparation();
		},
		cancel: async (session) => {
			calls.cancel.push(session.sessionId);
		},
		isCancellation: (error) => error instanceof Cancellation,
		...overrides
	};
}

function createHandlers(overrides = {}) {
	const seen = { state: [], resolutionRequired: [], resolved: [], failure: [], cancelled: 0 };

	return {
		seen,
		onState: (state) => seen.state.push(state),
		onResolutionRequired: (value) => seen.resolutionRequired.push(value),
		resolve: async (value) => {
			seen.resolved.push(value);
		},
		onFailure: (error) => seen.failure.push(error),
		onCancelled: () => {
			seen.cancelled += 1;
		},
		...overrides
	};
}

// --- The ordinary path ----------------------------------------------------------------

test('a session that completes without a conflict resolves and leaves nothing pending', async () => {
	const driver = createDriver();
	const handlers = createHandlers();
	const flow = new LinkSessionFlow(driver, handlers);

	await flow.begin();
	await flow.settled();

	assert.equal(driver.calls.start, 1);
	assert.deepEqual(handlers.seen.state, [STATE]);
	assert.equal(handlers.seen.resolved.length, 1);
	assert.equal(handlers.seen.resolutionRequired.length, 0);
	assert.equal(flow.session, null);
	assert.equal(flow.isFinalizing, false);
});

test('a session needing a conflict decision stops and holds the preparation', async () => {
	const prepared = preparation({ requiresResolution: true, recommendedMode: 'pull' });
	const driver = createDriver({ finish: async () => prepared });
	const handlers = createHandlers();
	const flow = new LinkSessionFlow(driver, handlers);

	await flow.begin();
	await flow.settled();

	assert.deepEqual(handlers.seen.resolutionRequired, [prepared]);
	assert.equal(handlers.seen.resolved.length, 0, 'nothing is resolved without the user');
	assert.equal(flow.isFinalizing, false);
	assert.equal(flow.session, null, 'the session is over; the decision outlives it');
});

// --- Cancellation ---------------------------------------------------------------------

test('cancelling in flight cancels the session remotely and clears what was pending', async () => {
	const driver = createDriver({ finish: () => new Promise(() => {}) });
	const handlers = createHandlers();
	const flow = new LinkSessionFlow(driver, handlers);

	await flow.begin();
	await flow.cancel();

	assert.deepEqual(driver.calls.cancel, [SESSION.sessionId]);
	assert.equal(handlers.seen.cancelled, 1);
	assert.equal(flow.session, null);
	assert.equal(flow.isFinalizing, false);
});

test('cancelling with nothing in flight asks the remote for nothing', async () => {
	const driver = createDriver();
	const handlers = createHandlers();
	const flow = new LinkSessionFlow(driver, handlers);

	await flow.cancel();

	assert.deepEqual(driver.calls.cancel, []);
	assert.equal(handlers.seen.cancelled, 0);
});

// a remote that refuses the cancellation must not strand the local state, which is the
// whole reason the call is allowed to fail.
test('a cancellation the remote refuses still clears the local session', async () => {
	const driver = createDriver({
		finish: () => new Promise(() => {}),
		cancel: async () => {
			throw new Error('the remote refused');
		}
	});
	const handlers = createHandlers();
	const flow = new LinkSessionFlow(driver, handlers);

	await flow.begin();
	await flow.cancel();

	assert.equal(flow.session, null);
	assert.equal(handlers.seen.cancelled, 1);
});

test('a cancellation raised by the driver is not reported as a failure', async () => {
	const driver = createDriver({
		finish: async () => {
			throw new Cancellation('the user closed the window');
		}
	});
	const handlers = createHandlers();
	const flow = new LinkSessionFlow(driver, handlers);

	await flow.begin();
	await flow.settled();

	assert.deepEqual(handlers.seen.failure, []);
	assert.equal(flow.isFinalizing, false);
});

test('a failure that is not a cancellation is reported', async () => {
	const failure = new Error('the network went away');
	const driver = createDriver({
		finish: async () => {
			throw failure;
		}
	});
	const handlers = createHandlers();
	const flow = new LinkSessionFlow(driver, handlers);

	await flow.begin();
	await flow.settled();

	assert.deepEqual(handlers.seen.failure, [failure]);
	assert.equal(flow.isFinalizing, false);
});

// --- Supersession ---------------------------------------------------------------------

/** a driver handing each session its own pending finish, so one can be settled alone. */
function createSupersedingDriver() {
	const sessions = [SESSION, OTHER_SESSION];
	const pending = new Map();

	return {
		pending,
		start: async () => sessions.shift(),
		finish: (session, options) => {
			let settle;
			const promise = new Promise((resolve) => {
				settle = resolve;
			});
			pending.set(session.sessionId, { settle, onResult: options.onResult });
			return promise;
		},
		cancel: async () => {},
		isCancellation: (error) => error instanceof Cancellation
	};
}

// the guard both components hand-rolled: a session that finishes after the user started
// another must not write its result over the one that replaced it.
test('a superseded session finishing late changes nothing', async () => {
	const driver = createSupersedingDriver();
	const handlers = createHandlers();
	const flow = new LinkSessionFlow(driver, handlers);

	await flow.begin();
	await flow.begin();
	driver.pending.get(SESSION.sessionId).settle(preparation());
	// the replacement is still outstanding by design, so there is no promise to await
	// here — only the superseded one's continuation has to run.
	await flush();

	assert.deepEqual(handlers.seen.state, [], 'the late result is discarded');
	assert.equal(handlers.seen.resolved.length, 0);
	assert.equal(flow.session?.sessionId, OTHER_SESSION.sessionId, 'the replacement still stands');
});

test('finalizing is only raised for the session that is still current', async () => {
	const driver = createSupersedingDriver();
	const flow = new LinkSessionFlow(driver, createHandlers());

	await flow.begin();
	await flow.begin();
	driver.pending.get(SESSION.sessionId).onResult({ status: 'completed' });

	assert.equal(flow.isFinalizing, false);
});

test('finalizing is raised when the current session completes', async () => {
	const driver = createSupersedingDriver();
	const flow = new LinkSessionFlow(driver, createHandlers());

	await flow.begin();
	driver.pending.get(SESSION.sessionId).onResult({ status: 'completed' });

	assert.equal(flow.isFinalizing, true);
});

// --- Observers ------------------------------------------------------------------------

test('every state change notifies the observer', async () => {
	const driver = createDriver();
	const flow = new LinkSessionFlow(driver, createHandlers());
	let notifications = 0;
	flow.observe(() => {
		notifications += 1;
	});

	await flow.begin();
	await flow.settled();

	assert.ok(notifications > 0, 'the reactive wrapper has something to mirror');
});
