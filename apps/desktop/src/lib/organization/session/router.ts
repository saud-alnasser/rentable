import type { SessionsEnded } from '$lib/organization/host';
import { procedure } from '$lib/api/trpc';
import z from 'zod';

import { PASSWORD_FLOOR } from '../setup/setup';

/**
 * THE READER'S OWN SESSION'S PROCEDURES
 *
 * Mounted at the organization router's root, as `session` and `password`, by `../router.ts`.
 */
export default {
	/**
	 * The reader's own sessions on their other machines, ended from the account section (effort 826,
	 * requirement 22).
	 *
	 * **`member`, because it is theirs**: it acts on the caller's own row and nobody else's, it
	 * asks for no password, and there is no act to hold it to. What it needs is somebody to be
	 * signed in, which is exactly what `member` says.
	 */
	session: {
		endElsewhere: procedure.member.mutation(async ({ ctx }): Promise<SessionsEnded> => {
			return ctx.host.organization.sessionEndElsewhere();
		})
	},
	/**
	 * The signed-in member's own password. `member`, because it is theirs: the current password
	 * is what the shell checks, and the floor is the first run's, refused here before the
	 * derivation runs for a caller that is not the form.
	 */
	password: {
		change: procedure.member
			.input(z.object({ current: z.string().min(1), next: z.string().min(PASSWORD_FLOOR) }))
			.mutation(async ({ input, ctx }): Promise<void> => {
				await ctx.host.organization.changePassword(input.current, input.next);
			})
	}
};
