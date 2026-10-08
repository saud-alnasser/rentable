import type { StartupMachine } from './machine';

/**
 * Open another of the workspaces the member holds, from inside the application.
 *
 * **The sign-in path past the wall, under a loading page, and not a switch in place.** The shell
 * records the chosen workspace as current and opens its replica, and then the same open, changes
 * and records stages a sign-in runs bring the application up on it. An in-place switch would
 * redraw every list under the new name while the old rows were still on screen, which is the
 * failure [[rules/data]] on cached queries is written against; the loading page for a second is
 * the cost, and it is the second a sign-in costs.
 *
 * **What changed with effort 843 (requirement 12) is what is drawn, and where the address lands.**
 * Until then this set `loading` and the page was replaced by the startup surface, the mark and the
 * stage bar, as if the application were launching. Now it sets `switching` beside `loading`, the
 * name of the workspace being opened, and the root keeps the rail and the titlebar and draws the
 * shared loading block where the page was, saying which workspace is opening. And before the open
 * the address moves off a record, through `arrive`: a record on screen belongs to the workspace
 * being left, so its page goes to its directory, which the other workspace has too
 * (`addressAfterSwitch` in `./screen`). The move is waited for under the loading page, so the
 * directory is not drawn from the old workspace on the way.
 *
 * **What was drawn is dropped after the shell has opened the workspace, not before.** The loading
 * page replaces the routed page as soon as this sets `loading`, so by the time the open has come
 * back nothing is drawing the page's queries and they can go. The rail is still drawing its own,
 * and those are refetched rather than removed, since a query removed from under a live observer
 * is never heard from again; the remote-sync query is then seeded with what the changes stage
 * read, so the rail names the new workspace without waiting on it.
 *
 * The session is not remembered again: the member and the database proxy are what they were,
 * and only the workspace behind the proxy changed. A failure is the ordinary startup failure,
 * whose retry reopens whatever the shell recorded as current; a workspace refused, for its version
 * or for a reason of its own, is the held screen in its place instead (`StartupMachine.fail`). `switching` is cleared whichever
 * way the pass ends, since what it names is only true while the pass runs.
 */
export async function switchWorkspace(
	machine: StartupMachine,
	workspaceId: string,
	{ arrive }: { arrive?: () => Promise<unknown> } = {}
) {
	if (machine.current.isSigningIn || machine.current.state === 'loading') {
		return;
	}

	// the menu offers the workspaces the session holds, so the chosen one is named there. One the
	// session does not hold is refused here rather than opened under a loading line naming nothing:
	// it can only come from somewhere other than the menu, and what it would open is not this
	// member's (effort 843, at the human's word on 2026-10-01).
	const chosen = machine.current.organization?.session?.workspaces.find(
		(workspace) => workspace.id === workspaceId
	);

	if (!chosen) {
		return;
	}

	// **a workspace this run found past reading is not opened again** (effort 857, requirement 8):
	// its workspace-held screen comes back, with the others still offered from it, rather than a
	// loading page ending on the same refusal. One held for any other reason is opened again,
	// since the person chose it and what refused it can pass (ticket 25).
	const known = machine.heldWorkspace(workspaceId);

	if (known?.byVersion) {
		machine.ports.undo.forget();
		await machine.standHeld(known);

		return;
	}

	machine.set({ state: 'loading', error: null, recovery: null, switching: chosen.name });

	// before the open rather than after it: a failed open may or may not have moved the shell, and
	// the changes on the stack were made in the workspace the member asked to leave either way.
	machine.ports.undo.forget();

	try {
		if (arrive) {
			try {
				await arrive();
			} catch {
				// the address stays where it was; the page is not drawn until the pass ends.
			}
		}

		try {
			machine.opens(workspaceId);
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
	} finally {
		machine.set({ switching: null });
	}
}
