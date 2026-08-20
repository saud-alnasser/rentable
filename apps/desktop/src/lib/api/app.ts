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
	// account's: the settings page offers it, that page is reachable signed out, and neither call
	// touches the workspace.
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
