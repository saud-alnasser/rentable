import type { Recovery } from '$lib/platform/tauri';
import { procedure, router } from '$lib/api/trpc';
import { reconcile } from '$lib/contract/reconcile';
import settings from '$lib/settings/router';
import { remoteSync } from '$lib/sync/router';
import z from 'zod';

export default router({
	bootstrap: procedure.member.mutation(async ({ ctx }): Promise<Recovery> => {
		return await ctx.host.bootstrap();
	}),
	settings,
	remoteSync,
	// **`public`, both of them.** Updating is this installation's business rather than an
	// account's: the settings page offers it, neither call touches the workspace, and which
	// addresses draw with nobody signed in is `layout/shell-surface.ts`'s answer rather than a
	// claim made here. It read as one until 2026-08-21, and was wrong the whole time it did:
	// these two landed public and the route gate that would have made the sentence true did not.
	update: {
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
	},
	state: {
		reconcile: procedure.member.mutation(async ({ ctx }) => {
			const reconciledAt = ctx.clock.now();
			await reconcile(ctx.db, reconciledAt);

			return { reconciledAt };
		})
	}
});
