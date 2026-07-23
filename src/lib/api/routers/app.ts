import type {
	BackupEntry,
	Recovery,
	RemoteSyncState,
	Settings,
	SettingsChangeset
} from '$lib/api/tauri';
import { reconcile } from '$lib/api/reconcile';
import { autosync, procedure, router } from '$lib/api/trpc';
import z from 'zod';

export default router({
	bootstrap: procedure.public.mutation(async ({ ctx }): Promise<Recovery> => {
		return await ctx.host.bootstrap();
	}),
	settings: {
		get: procedure.public.query(async ({ ctx }): Promise<Settings> => {
			return ctx.host.settings.get();
		}),
		set: procedure.public
			.input(
				z.object({
					endingSoonNoticeDays: z.number().int().optional(),
					locale: z.string().optional()
				})
			)
			.mutation(async ({ input, ctx }) => {
				return ctx.host.settings.set({
					endingSoonNoticeDays: input.endingSoonNoticeDays,
					locale: input.locale
				} satisfies SettingsChangeset);
			})
	},
	backup: {
		create: procedure.public.mutation(async ({ ctx }): Promise<BackupEntry> => {
			return ctx.host.backup.create();
		}),
		list: procedure.public.query(async ({ ctx }): Promise<BackupEntry[]> => {
			return ctx.host.backup.list();
		}),
		delete: procedure.public
			.input(
				z.object({
					filename: z.string().trim().min(1)
				})
			)
			.mutation(async ({ input, ctx }) => {
				return ctx.host.backup.delete(input.filename);
			}),
		restore: procedure.public
			.use(autosync())
			.input(
				z.object({
					filename: z.string().trim().min(1)
				})
			)
			.mutation(async ({ input, ctx }) => {
				return ctx.host.backup.restore(input.filename);
			})
	},
	remoteSync: {
		getState: procedure.public.query(async ({ ctx }): Promise<RemoteSyncState> => {
			return ctx.host.remoteSync.getState();
		}),
		snapshotNow: procedure.public.mutation(async ({ ctx }): Promise<RemoteSyncState> => {
			return ctx.host.remoteSync.snapshotNow();
		})
	},
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
	window: {
		show: procedure.public.mutation(async ({ ctx }) => {
			await ctx.host.window.show();
		}),
		hide: procedure.public.mutation(async ({ ctx }) => {
			await ctx.host.window.hide();
		}),
		minimize: procedure.public.mutation(async ({ ctx }) => {
			await ctx.host.window.minimize();
		}),
		maximize: procedure.public.mutation(async ({ ctx }) => {
			await ctx.host.window.maximize();
		}),
		drag: procedure.public.mutation(async ({ ctx }) => {
			await ctx.host.window.drag();
		}),
		close: procedure.public.mutation(async ({ ctx }) => {
			await ctx.host.window.close();
		}),
		restart: procedure.public.mutation(async ({ ctx }) => {
			await ctx.host.window.restart();
		})
	},
	state: {
		reconcile: procedure.public.mutation(async ({ ctx }) => {
			const reconciledAt = ctx.clock.now();
			await reconcile(ctx.db, reconciledAt);

			return { reconciledAt };
		})
	}
});
