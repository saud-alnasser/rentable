import assert from 'node:assert/strict';
import test from 'node:test';

import type { Context } from '$lib/api/context.ts';
import { caller, context, procedure, router } from '$lib/api/trpc.ts';
import { createMemoryDatabase } from '$lib/platform/database/memory.ts';
import { fakeHost } from '$lib/app/tests/host.ts';
import {
	fakeOrganizationSession,
	fakeOrganizationState,
	fakeOrganizationWorkspace
} from '$lib/organization/tests/testing.ts';
import { fakeSyncState, fakeWorkspace } from '$lib/sync/tests/testing.ts';
import { maskOf } from '@rentable/workspace-permission';

import { startupScreen } from '$lib/startup/screen.ts';

import { A_DAY, AT, harness, locked, unlocked } from './harness.ts';

/**
 * A RUNNING APPLICATION
 *
 * Path 8 of the eight `launch.test.ts` introduces, the window close that syncs first, and what
 * happens to an application already past the wall: the day crossing, a pull that brought rows, a
 * heartbeat carrying a change made on another machine, and a switch between workspaces. Driven the
 * same way, through the harness, with no window and no module mocked.
 */

// --- 8. The window close that syncs before it closes -----------------------------------

test('closing a running application pushes what it holds before the window goes', async () => {
	const { startup, journal } = harness();

	await startup.start();
	await startup.closeWindow();

	// hidden first, so a slow push looks like an application that closed rather than one that hung,
	// and closed last, because a window closed before the push is a push that never lands.
	assert.deepEqual(journal.sequence, ['hide', 'sync', 'close']);
});

test('and closing from any other state syncs nothing, because there is nothing behind it', async () => {
	const { startup, journal } = harness({ organization: locked() });

	await startup.start();
	assert.equal(startup.snapshot.state, 'sign-in');
	assert.equal(startup.closesWithoutSyncing, true);

	await startup.closeWindow(startup.closesWithoutSyncing);

	assert.equal(journal.syncedBeforeExit, 0);
	assert.equal(journal.closed, 1);
});

test('and a second close request while one is in flight is ignored rather than doubled', async () => {
	const { startup, journal } = harness();

	await startup.start();
	await startup.closeWindow();
	await startup.closeWindow();

	assert.equal(journal.closed, 1);
});

// --- What the day and the network do to a running application ---------------------------

test('a day crossing recomputes what the date decides, and only once it has crossed', async () => {
	const { startup, journal, now } = harness();

	await startup.start();
	const reconciledOnStartup = journal.reconciled;

	await startup.reconcileOnDayCrossing();
	assert.equal(journal.reconciled, reconciledOnStartup, 'same day, nothing to do');

	now.value = AT + A_DAY;
	await startup.reconcileOnDayCrossing();

	assert.equal(journal.reconciled, reconciledOnStartup + 1);
});

test('and a pull that landed rows announces them, while one that landed none does not', async () => {
	const { startup, journal } = harness();

	await startup.start();

	await startup.applySyncOutcome({ action: 'none', received: false, workspaceId: 'north' });
	assert.equal(journal.announced, 0, 'nothing arrived, so nothing to announce');

	await startup.applySyncOutcome({ action: 'none', received: true, workspaceId: 'north' });
	assert.equal(journal.announced, 1, 'rows arrived, and derived state has to be told');
});

// --- A change on another machine, after one heartbeat ---------------------------------------

/**
 * **Criterion 8 of effort 838, on this side of the boundary.** A role or an override changed on
 * another machine reaches an open session within one sync heartbeat: what the heartbeat reports is
 * applied here, and that is where the held API context is dropped and the organization read again.
 *
 * The context is a real one over a real caller, built the way `api/caller` builds it and dropped by
 * the port the application wires to `forgetContext`; the shell behind it is a fake whose state the
 * test moves, as another machine's write reaching the replica would.
 */
const heartbeatRouter = router({
	rename: procedure.permitted('renameWorkspace').query(() => 'renamed')
});

test('a member narrowed on another machine is refused on the next call after one heartbeat', async () => {
	const widened = fakeOrganizationState({
		session: fakeOrganizationSession({ permissions: maskOf('renameWorkspace') })
	});
	const narrowed = fakeOrganizationState({ session: fakeOrganizationSession({ permissions: 0 }) });
	let shell = widened;
	const host = fakeHost({
		organization: { ...fakeHost().organization, getState: async () => shell },
		sync: {
			...fakeHost().sync,
			getState: async () => fakeSyncState({ workspace: fakeWorkspace({ remoteId: 'north' }) })
		}
	});
	let held: Promise<Context> | null = null;
	const api = caller(heartbeatRouter)(
		() => (held ??= context({ db: createMemoryDatabase(), clock: { now: () => AT }, host }))
	);
	const { startup, journal, standWith } = harness({
		organization: widened,
		forgetContext: () => {
			held = null;
		}
	});

	await startup.start();
	assert.equal(await api.rename(), 'renamed');

	// the narrowing lands on the replica; nothing on this machine has asked since.
	shell = narrowed;
	standWith(narrowed);

	const invalidatedBefore = journal.organizationInvalidated;
	const everythingBefore = journal.invalidatedAll;
	await startup.applySyncOutcome({ action: 'none', received: false, workspaceId: 'north' });

	const refusal = await api.rename().then(
		() => null,
		(error: unknown) => error as { code?: string }
	);

	assert.equal(refusal?.code, 'FORBIDDEN', 'the next call acted on what the member held before');
	assert.equal(startup.snapshot.organization?.session?.permissions, 0);
	// what the member may do moved, so every record is read again under it, the organization's
	// queries with them.
	assert.equal(journal.invalidatedAll, everythingBefore + 1);
	assert.equal(journal.organizationInvalidated, invalidatedBefore);

	// a heartbeat that moves nothing reads the organization alone.
	await startup.applySyncOutcome({ action: 'none', received: false, workspaceId: 'north' });

	assert.equal(journal.invalidatedAll, everythingBefore + 1);
	assert.equal(journal.organizationInvalidated, invalidatedBefore + 1);

	// and the other way: widened again, the next heartbeat gives the act back.
	shell = widened;
	standWith(widened);
	await startup.applySyncOutcome({ action: 'none', received: false, workspaceId: 'north' });

	assert.equal(await api.rename(), 'renamed');
});

// rows that land while a day-crossing pass is out are announced after it rather than dropped:
// that pass may have read the tables before they arrived, and nothing else refetches them.
test('and rows that land while a day-crossing reconcile is out are announced once it is back', async () => {
	let release: () => void = () => {};
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	let holding = false;
	const { startup, journal, now } = harness({
		reconcile: async () => {
			// the day-crossing pass waits; the launch's own and what follows it do not.
			if (holding) {
				holding = false;
				await held;
			}
		}
	});

	await startup.start();

	now.value = AT + A_DAY;
	holding = true;
	const crossing = startup.reconcileOnDayCrossing();
	await startup.applySyncOutcome({ action: 'none', received: true, workspaceId: 'north' });
	assert.equal(journal.announced, 0, 'the pass is still out, so the rows wait');

	release();
	await crossing;

	assert.equal(journal.announced, 1, 'and are announced once it is back');
});

// --- A switch between workspaces, from inside the application -----------------------------

/** a member holding two workspaces, with the first one open. */
const holdingTwo = () =>
	harness({
		organization: fakeOrganizationState({
			session: fakeOrganizationSession({
				workspaces: [
					fakeOrganizationWorkspace({ id: 'north' }),
					fakeOrganizationWorkspace({ id: 'south', name: 'South' })
				]
			})
		})
	});

test('switching workspaces drops what was drawn, opens the chosen one, and runs the stages to ready', async () => {
	const { startup, journal, seen } = holdingTwo();

	await startup.start();
	assert.deepEqual(journal.workspacesOpened, ['north']);

	const seenBefore = seen.length;
	const forgottenBefore = journal.contextsForgotten;
	await startup.switchWorkspace('south');

	// the loading surface went up first, and the application came back on the chosen workspace by
	// the three stages a sign-in runs past the wall.
	assert.equal(seen[seenBefore]?.state, 'loading');
	assert.equal(startup.snapshot.state, 'ready');
	assert.equal(startup.snapshot.error, null);
	assert.deepEqual(journal.workspacesOpened, ['north', 'south']);
	assert.deepEqual(journal.stages.slice(-3), ['workspace', 'changes', 'records']);
	assert.equal(journal.bootstrapped, 2);
	assert.equal(journal.reconciled, 2);
	// nothing drawn from the workspace that was open survives: what the page drew is dropped, and
	// what the rail draws is refetched rather than removed from under it.
	assert.equal(journal.undrawnDropped, 1);
	assert.equal(journal.invalidatedAll, 1);
	// the rail reads the new workspace off its own query without waiting for a refetch.
	assert.equal(journal.remembered.at(-1)?.workspace.remoteId, 'south');
	assert.equal(startup.snapshot.sync?.workspace.remoteId, 'south');
	// the member is who they were, and what they may do is not: the context is dropped once, since
	// a read-only grant on the workspace now open clears writes the one before allowed (effort 838).
	assert.equal(journal.contextsForgotten, forgottenBefore + 1);
});

// criterion 12 of effort 843: a switch keeps the window. What the page draws in the meantime is
// named by `switching`, set before the open and cleared once the pass ends, and the address has
// moved off a record before the open, under the loading page.
test('a switch names the workspace it is opening from before the open until the pass ends', async () => {
	const during: { switching: string | null; screen: string }[] = [];
	const order: string[] = [];
	const at: { harness: ReturnType<typeof harness> | null } = { harness: null };
	const onScreen = (label: string) => {
		const snapshot = at.harness!.startup.snapshot;

		order.push(label);
		during.push({ switching: snapshot.switching, screen: startupScreen(snapshot, '/contracts') });
	};

	at.harness = harness({
		organization: fakeOrganizationState({
			session: fakeOrganizationSession({
				workspaces: [
					fakeOrganizationWorkspace({ id: 'north' }),
					fakeOrganizationWorkspace({ id: 'south', name: 'South' })
				]
			})
		}),
		openWorkspace: async (workspaceId) => {
			if (workspaceId === 'south') onScreen('open');
		},
		dropUndrawn: () => onScreen('drop')
	});

	const { startup, seen } = at.harness;

	await startup.start();
	assert.equal(startup.snapshot.switching, null, 'a launch is not a switch');

	const seenBefore = seen.length;
	await startup.switchWorkspace('south', { arrive: async () => onScreen('arrive') });

	// set with the loading state, in the same change, so no frame draws the startup bar first.
	assert.equal(seen[seenBefore]?.state, 'loading');
	assert.equal(seen[seenBefore]?.switching, 'South');
	// the address moved first, then the open, then what the page drew was dropped; and all three
	// happened with the page's screen as the switch's rather than the route's.
	assert.deepEqual(order, ['arrive', 'open', 'drop']);
	assert.deepEqual(
		during,
		['arrive', 'open', 'drop'].map(() => ({ switching: 'South', screen: 'switching' }))
	);
	// cleared once the pass is over, with the application ready on the other workspace.
	assert.equal(startup.snapshot.switching, null);
	assert.equal(startup.snapshot.state, 'ready');
	assert.equal(startupScreen(startup.snapshot, '/contracts'), 'route');
	// and no route was drawn from the moment the switch began until the other workspace was ready.
	const passing = seen.slice(seenBefore);
	const readyAt = passing.findIndex((snapshot) => snapshot.state === 'ready');
	assert.ok(readyAt > 0);
	assert.ok(
		passing
			.slice(0, readyAt)
			.every((snapshot) => startupScreen(snapshot, '/contracts') === 'switching')
	);
});

test('and a switch that fails clears it too, leaving the ordinary failure on screen', async () => {
	const { startup } = harness({
		organization: fakeOrganizationState({
			session: fakeOrganizationSession({
				workspaces: [
					fakeOrganizationWorkspace({ id: 'north' }),
					fakeOrganizationWorkspace({ id: 'south', name: 'South' })
				]
			})
		}),
		openWorkspace: async (workspaceId) => {
			if (workspaceId === 'south') throw new Error('the replica would not open');
		}
	});

	await startup.start();
	await startup.switchWorkspace('south');

	assert.equal(startup.snapshot.switching, null);
	assert.equal(startupScreen(startup.snapshot, '/contracts'), 'error');
});

test('and an address that would not move is no reason to stop the switch', async () => {
	const { startup, journal } = holdingTwo();

	await startup.start();
	await startup.switchWorkspace('south', {
		arrive: async () => {
			throw new Error('navigation refused');
		}
	});

	assert.deepEqual(journal.workspacesOpened, ['north', 'south']);
	assert.equal(startup.snapshot.state, 'ready');
	assert.equal(startup.snapshot.switching, null);
});

test('and a workspace the shell would not open is the ordinary failure, with nothing dropped', async () => {
	const { startup, journal } = harness({
		organization: fakeOrganizationState({
			session: fakeOrganizationSession({
				workspaces: [
					fakeOrganizationWorkspace({ id: 'north' }),
					fakeOrganizationWorkspace({ id: 'south', name: 'South' })
				]
			})
		}),
		openWorkspace: async (workspaceId) => {
			if (workspaceId === 'south') {
				throw new Error('the replica would not open');
			}
		}
	});

	await startup.start();
	await startup.switchWorkspace('south');

	assert.equal(startup.snapshot.state, 'error');
	assert.equal(startup.snapshot.error, 'the replica would not open');
	assert.deepEqual(journal.failures, ['the replica would not open']);
	assert.equal(journal.undrawnDropped, 0, 'what was drawn is still what is open');
	assert.equal(journal.bootstrapped, 1, 'nothing behind the open ran');
});

test('and a switch asked for while one is loading, or while a password is being tried, does nothing', async () => {
	const loading = holdingTwo();

	await loading.startup.start();

	// the second request lands while the first is still under the loading surface.
	const first = loading.startup.switchWorkspace('south');
	await loading.startup.switchWorkspace('north');
	await first;

	assert.deepEqual(loading.journal.workspacesOpened, ['north', 'south']);
	assert.equal(loading.startup.snapshot.state, 'ready');

	// and one that lands while a password is being derived is refused the same way.
	const signingIn: { harness: ReturnType<typeof harness> | null } = { harness: null };
	signingIn.harness = harness({
		organization: locked(),
		signInWith: async () => {
			await signingIn.harness?.startup.switchWorkspace('south');

			return unlocked();
		}
	});

	await signingIn.harness.startup.start();
	await signingIn.harness.startup.signIn('olivia', 'a long enough password');

	assert.deepEqual(signingIn.harness.journal.workspacesOpened, ['north']);
	assert.equal(signingIn.harness.startup.snapshot.state, 'ready');
});

// the card is still on screen while the workspace is being opened, which is a pull of the
// organization replica and an open of the workspace's own: a second submit in that window would
// derive a second key and run the way in twice, so the card stays closed until the loading
// surface is up.
test('and the card stays closed while the workspace the sign-in reached is being opened', async () => {
	const opening: { harness: ReturnType<typeof harness> | null; seen: boolean[] } = {
		harness: null,
		seen: []
	};
	opening.harness = harness({
		organization: locked(),
		openWorkspace: async () => {
			opening.seen.push(opening.harness?.startup.snapshot.isSigningIn ?? false);
			// a second submit lands while the open is out, and is refused.
			await opening.harness?.startup.signIn('olivia', 'a long enough password');
		}
	});

	await opening.harness.startup.start();
	await opening.harness.startup.signIn('olivia', 'a long enough password');

	assert.deepEqual(opening.seen, [true], 'the card was closed while the open was out');
	assert.deepEqual(opening.harness.journal.workspacesOpened, ['north'], 'and opened once');
	assert.equal(opening.harness.startup.snapshot.isSigningIn, false);
	assert.equal(opening.harness.startup.snapshot.state, 'ready');
});

// the plan's first technical risk: a dispatch in flight during the switch reports for the
// workspace it started on, after the application is up on the new one.
test('and a dispatch that reported for the workspace open before the switch is dropped whole', async () => {
	const { startup, journal } = holdingTwo();

	await startup.start();
	await startup.switchWorkspace('south');
	assert.equal(startup.snapshot.state, 'ready');

	const before = { snapshot: startup.snapshot, journal: { ...journal } };
	await startup.applySyncOutcome({ action: 'none', received: true, workspaceId: 'north' });

	assert.equal(journal.announced, before.journal.announced, 'no rows were announced');
	assert.equal(journal.remoteSyncInvalidated, before.journal.remoteSyncInvalidated);
	assert.equal(journal.remembered.length, before.journal.remembered.length);
	assert.deepEqual(startup.snapshot, before.snapshot, 'and the reader saw nothing change');

	// while one for the workspace that is open now is applied as every outcome is.
	await startup.applySyncOutcome({ action: 'none', received: true, workspaceId: 'south' });

	assert.equal(journal.announced, before.journal.announced + 1);
});

// at the human's word on 2026-10-01 (effort 843): a workspace the session does not hold is refused
// rather than opened under a loading line that names nothing.
test('a switch to a workspace the session does not hold does nothing', async () => {
	const { startup, journal } = holdingTwo();

	await startup.start();

	const before = [...journal.workspacesOpened];

	await startup.switchWorkspace('nowhere');

	assert.deepEqual(journal.workspacesOpened, before);
	assert.equal(startup.snapshot.state, 'ready');
	assert.equal(startup.snapshot.switching, null);
});
