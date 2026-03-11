import { tauri, type SettingsSnapshot } from '$lib/api/tauri';
import { procedure, router } from '$lib/api/trpc';
import z from 'zod';

export default router({
	get: procedure.public.query(async (): Promise<SettingsSnapshot> => {
		return tauri.settings.get();
	}),
	setEndingSoonNoticeDays: procedure.public
		.input(
			z.object({
				days: z.number().int().positive()
			})
		)
		.mutation(async ({ input }): Promise<SettingsSnapshot> => {
			return tauri.settings.setEndingSoonNoticeDays(input.days);
		}),
	setDatabasePath: procedure.public
		.input(
			z.object({
				path: z.string().optional()
			})
		)
		.mutation(async ({ input }): Promise<SettingsSnapshot> => {
			return tauri.settings.setDatabasePath(input.path);
		}),
	resetDatabasePath: procedure.public.mutation(async (): Promise<SettingsSnapshot> => {
		return tauri.settings.resetDatabasePath();
	}),
	createBackup: procedure.public.mutation(async (): Promise<SettingsSnapshot> => {
		return tauri.settings.createBackup();
	}),
	proceedFailedUpdate: procedure.public.mutation(async (): Promise<SettingsSnapshot> => {
		return tauri.settings.proceedFailedUpdate();
	}),
	rollbackFailedUpdate: procedure.public.mutation(async (): Promise<SettingsSnapshot> => {
		return tauri.settings.rollbackFailedUpdate();
	}),
	deleteBackup: procedure.public
		.input(
			z.object({
				name: z.string().trim().min(1)
			})
		)
		.mutation(async ({ input }): Promise<SettingsSnapshot> => {
			return tauri.settings.deleteBackup(input.name);
		}),
	restoreBackup: procedure.public
		.input(
			z.object({
				name: z.string().trim().min(1)
			})
		)
		.mutation(async ({ input }): Promise<SettingsSnapshot> => {
			return tauri.settings.restoreBackup(input.name);
		})
});
