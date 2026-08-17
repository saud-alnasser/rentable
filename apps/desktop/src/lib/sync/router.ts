import type { BackupEntry, RemoteSyncState } from '$lib/platform/tauri';
import { autosync, procedure, router } from '$lib/api/trpc';
import z from 'zod';

/**
 * SYNC ROUTER
 *
 * getting a workspace off this machine and back onto it, mounted by the app router at
 * `app.backup` and `app.remoteSync`. Two routers rather than one because the paths are
 * two, and one file because backup and sync produce the same snapshots — a change to
 * what a snapshot is touches both.
 */

export const backup = router({
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
});

export const remoteSync = router({
	getState: procedure.public.query(async ({ ctx }): Promise<RemoteSyncState> => {
		return ctx.host.remoteSync.getState();
	}),
	snapshotNow: procedure.public.mutation(async ({ ctx }): Promise<RemoteSyncState> => {
		return ctx.host.remoteSync.snapshotNow();
	})
});
