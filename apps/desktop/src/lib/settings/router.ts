import type { Settings, SettingsChangeset } from './host';
import { procedure, router } from '$lib/api/trpc';
import { APPEARANCES } from '$lib/platform/appearance';
import z from 'zod';

/**
 * SETTINGS ROUTER
 *
 * the user's own preferences, mounted at the root at `settings`. Every
 * procedure forwards to the host: settings live with the desktop shell, not in the
 * database, so there is nothing here to reconcile.
 *
 * **Both are `public`, which is requirement 9a.** Nothing here has an acting user to name, since
 * these are the settings of this copy of the application and not of a person, and the settings
 * open with nobody signed in: the way in's foot control offers all settings, and `/settings`
 * draws on the way-in frame. A procedure that refused for want of an identity would break that
 * page signed out.
 *
 * *Corrected 2026-10-01, effort 843: this named the signed-out rail's account row, and the effort
 * removed that rail.*
 */

export default router({
	get: procedure.public.query(async ({ ctx }): Promise<Settings> => {
		return ctx.host.settings.get();
	}),
	set: procedure.public
		.input(
			z.object({
				endingSoonNoticeDays: z.number().int().optional(),
				locale: z.string().optional(),
				appearance: z.enum(APPEARANCES).optional(),
				earlierRecordsSettled: z.boolean().optional()
			})
		)
		.mutation(async ({ input, ctx }) => {
			return ctx.host.settings.set({
				endingSoonNoticeDays: input.endingSoonNoticeDays,
				locale: input.locale,
				appearance: input.appearance,
				earlierRecordsSettled: input.earlierRecordsSettled
			} satisfies SettingsChangeset);
		})
});
