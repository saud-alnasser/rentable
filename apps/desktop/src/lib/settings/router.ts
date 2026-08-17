import type { Settings, SettingsChangeset } from '$lib/platform/tauri';
import { procedure, router } from '$lib/api/trpc';
import z from 'zod';

/**
 * SETTINGS ROUTER
 *
 * the user's own preferences, mounted by the app router at `app.settings`. Every
 * procedure forwards to the host: settings live with the desktop shell, not in the
 * database, so there is nothing here to reconcile.
 */

export default router({
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
});
