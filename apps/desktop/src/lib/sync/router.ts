import type { RemoteSyncState } from '$lib/platform/tauri';
import { procedure, router } from '$lib/api/trpc';
import { WORKSPACE_NAME_LIMIT } from '$lib/workspace/workspace';
import z from 'zod';

/**
 * SYNC ROUTER
 *
 * getting a workspace off this machine and back onto it, mounted by the app router at
 * `app.remoteSync`.
 *
 * *It carried a `backup` router beside this one, because backup and sync produced the same
 * snapshots. The backup surface retired with #569 and Turso holds the record, so there are no
 * snapshots for the two to have in common and only the window is left to ask about.*
 *
 * **`public`, and this is the one that is worth arguing.** It reads the shell's own record of what
 * this machine has synced — including whether anybody is signed in — so requiring an acting user
 * would make it answerable only to the machines whose answer is already known.
 */

export const remoteSync = router({
	getState: procedure.public.query(async ({ ctx }): Promise<RemoteSyncState> => {
		return ctx.host.remoteSync.getState();
	}),
	/**
	 * Call this machine's workspace something else.
	 *
	 * **`permitted`, and it is the neighbour above that makes it worth saying why.** Reading what
	 * this machine has synced is answerable to anybody, because it is a fact about the machine. A
	 * workspace belongs to somebody, and renaming one is a write against a row the control plane
	 * guards with a permission — so it needs an acting user however small the change looks.
	 *
	 * **And now it names which permission.** It was `member` until 2026-08-21, which asked whether
	 * anybody was signed in and not whether *this* somebody may rename anything; the control plane
	 * has refused a member without `renameWorkspace` since #703, and this side found out by being
	 * told no. The two halves of the argument are now both here: who is acting, and what they may
	 * do.
	 *
	 * **It is the earlier of two refusals and never the deciding one.** The control plane checks
	 * the membership row again on every call, and a client is a thing a person can edit — so this
	 * exists to refuse a caller before a round trip rather than to be trusted instead of one.
	 *
	 * **It reaches `ctx.host` rather than `ctx.db`.** The name is not in the workspace database at
	 * all; it is in the control plane, and Rust is what holds the credential to reach it.
	 *
	 * The bound is the same one the control plane enforces, stated here so a caller is refused
	 * before a round trip rather than after one. It is not a third opinion: the form validates for
	 * the reader, this refuses a caller, and the service is the one that decides what it stores.
	 */
	rename: procedure
		.permitted('renameWorkspace')
		.input(z.object({ name: z.string().trim().min(1).max(WORKSPACE_NAME_LIMIT) }))
		.mutation(async ({ input, ctx }): Promise<RemoteSyncState> => {
			return ctx.host.remoteSync.renameWorkspace(input.name);
		})
});
