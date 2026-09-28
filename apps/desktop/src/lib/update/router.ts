import { procedure, router } from '$lib/api/trpc';
import z from 'zod';

/**
 * UPDATE ROUTER
 *
 * the updater: whether a newer version of the application exists, and preparing to install one.
 * Both forward to the host, which holds the updater.
 *
 * **`public`, both of them.** Updating is this installation's business rather than an
 * account's: the settings page offers it, neither call touches the workspace, and which
 * addresses draw with nobody signed in is `shell/shell-surface.ts`'s answer rather than a
 * claim made here. It read as one until 2026-08-21, and was wrong the whole time it did:
 * these two landed public and the route gate that would have made the sentence true did not.
 */
export default router({
	prepare: procedure.public
		.input(
			z.object({
				targetVersion: z.string().trim().min(1)
			})
		)
		.mutation(async ({ input, ctx }) => {
			return ctx.host.update.prepare(input.targetVersion);
		}),
	check: procedure.public.query(async ({ ctx }) => {
		return ctx.host.update.check();
	})
});
