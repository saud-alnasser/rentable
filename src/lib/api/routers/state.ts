import { tauri } from '$lib/api/tauri';
import { procedure, router } from '$lib/api/trpc';
import { sync } from '$lib/api/utils/sync';

export default router({
	sync: procedure.public.mutation(async ({ ctx }) => {
		const syncedAt = Date.now();
		await sync(ctx.db, syncedAt);
		await tauri.settings.markSynced(syncedAt);

		return { syncedAt };
	})
});
