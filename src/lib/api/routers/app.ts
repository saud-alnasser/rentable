import {
	tauri,
	type BackupEntry,
	type Recovery,
	type RemoteSyncState,
	type Settings,
	type SettingsChangeset
} from '$lib/api/tauri';
import { autosync, procedure, router } from '$lib/api/trpc';
import { sync } from '$lib/api/utils/sync';
import z from 'zod';

export default router({
	bootstrap: procedure.public.mutation(async (): Promise<Recovery> => {
		return await tauri.bootstrap();
	}),
	settings: {
		get: procedure.public.query(async (): Promise<Settings> => {
			return tauri.settings.get();
		}),
		set: procedure.public
			.input(
				z.object({
					endingSoonNoticeDays: z.number().int().optional(),
					locale: z.string().optional()
				})
			)
			.mutation(async ({ input }) => {
				return tauri.settings.set({
					endingSoonNoticeDays: input.endingSoonNoticeDays,
					locale: input.locale
				} satisfies SettingsChangeset);
			})
	},
	backup: {
		create: procedure.public.mutation(async (): Promise<BackupEntry> => {
			return tauri.backup.create();
		}),
		list: procedure.public.query(async (): Promise<BackupEntry[]> => {
			return tauri.backup.list();
		}),
		delete: procedure.public
			.input(
				z.object({
					filename: z.string().trim().min(1)
				})
			)
			.mutation(async ({ input }) => {
				return tauri.backup.delete(input.filename);
			}),
		restore: procedure.public
			.use(autosync())
			.input(
				z.object({
					filename: z.string().trim().min(1)
				})
			)
			.mutation(async ({ input }) => {
				return tauri.backup.restore(input.filename);
			})
	},
	remoteSync: {
		getState: procedure.public.query(async (): Promise<RemoteSyncState> => {
			return tauri.remoteSync.getState();
		}),
		snapshotNow: procedure.public.mutation(async (): Promise<RemoteSyncState> => {
			return tauri.remoteSync.snapshotNow();
		})
	},
	update: {
		prepare: procedure.public
			.input(
				z.object({
					targetVersion: z.string().trim().min(1)
				})
			)
			.mutation(async ({ input }) => {
				return tauri.update.prepare(input.targetVersion);
			}),
		check: procedure.public.query(async () => {
			return tauri.update.check();
		})
	},
	window: {
		show: procedure.public.mutation(async () => {
			await tauri.window.show();
		}),
		hide: procedure.public.mutation(async () => {
			await tauri.window.hide();
		}),
		minimize: procedure.public.mutation(async () => {
			await tauri.window.minimize();
		}),
		maximize: procedure.public.mutation(async () => {
			await tauri.window.maximize();
		}),
		drag: procedure.public.mutation(async () => {
			await tauri.window.drag();
		}),
		close: procedure.public.mutation(async () => {
			await tauri.window.close();
		}),
		restart: procedure.public.mutation(async () => {
			await tauri.window.restart();
		})
	},
	state: {
		sync: procedure.public.mutation(async ({ ctx }) => {
			const syncedAt = Date.now();
			await sync(ctx.db, syncedAt);

			return { syncedAt };
		})
	}
});
