import type { Settings, SettingsChangeset } from '$lib/platform/tauri';
import { procedure, router } from '$lib/api/trpc';
import z from 'zod';

/**
 * SETTINGS ROUTER
 *
 * the user's own preferences, mounted by the app router at `app.settings`. Every
 * procedure forwards to the host: settings live with the desktop shell, not in the
 * database, so there is nothing here to reconcile.
 *
 * **Both are `public`, which is requirement 9a.** Nothing here has an acting user to name — these
 * are the settings of this copy of the application, not of a person — and the shell now draws a
 * signed-out rail whose account row offers this page. A procedure that refused for want of an
 * identity would put a broken row in that menu.
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
