import type { StartupMachine } from './machine';

/**
 * Open another of the workspaces the member holds, from inside the application.
 *
 * **The sign-in path past the wall, under the loading surface, and not a switch in place.**
 * The shell records the chosen workspace as current and opens its replica, and then the same
 * open, changes and records stages a sign-in runs bring the application up on it. An in-place
 * switch would redraw every list under the new name while the old rows were still on screen,
 * which is the failure [[rules/data]] on cached queries is written against; the loading
 * surface for a second is the cost, and it is the second a sign-in costs.
 *
 * **What was drawn is dropped after the shell has opened the workspace, not before.** The
 * loading surface replaces the page as soon as this sets `loading`, so by the time the open
 * has come back nothing is drawing the page's queries and they can go. The rail is still
 * drawing its own, and those are refetched rather than removed, since a query removed from
 * under a live observer is never heard from again; the remote-sync query is then seeded with
 * what the changes stage read, so the rail names the new workspace without waiting on it.
 *
 * The session is not remembered again: the member and the database proxy are what they were,
 * and only the workspace behind the proxy changed. A failure is the ordinary startup failure,
 * whose retry reopens whatever the shell recorded as current.
 */
export async function switchWorkspace(machine: StartupMachine, workspaceId: string) {
	if (machine.current.isSigningIn || machine.current.state === 'loading') {
		return;
	}

	machine.set({ state: 'loading', error: null, recovery: null });

	try {
		await machine.ports.organization.openWorkspace(workspaceId);
	} catch (error) {
		await machine.fail(error);

		return;
	}

	// the member is who they were, and what they may do is not: a read-only grant on the
	// workspace now open clears the writes the held context carried for the one before.
	machine.ports.cache.forgetContext();
	machine.ports.cache.dropUndrawn();
	await machine.ports.cache.invalidateAll();

	await machine.enterApplication();

	const { state, sync } = machine.current;

	if (state === 'ready' && sync) {
		machine.ports.cache.rememberRemoteSync(sync);
	}
}
