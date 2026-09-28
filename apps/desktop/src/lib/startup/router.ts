import type { Recovery } from '$lib/platform/tauri';
import { procedure, router } from '$lib/api/trpc';

/**
 * STARTUP ROUTER
 *
 * what the application asks the host as it starts: the bootstrap, which opens this machine's
 * workspace and says what it had to recover to do so.
 */
export default router({
	bootstrap: procedure.member.mutation(async ({ ctx }): Promise<Recovery> => {
		return await ctx.host.bootstrap();
	})
});
