import type { UpgradeAwaiting, UpgradePreview } from '$lib/organization/host';
import { procedure } from '$lib/api/trpc';
import z from 'zod';

/** what is upgraded, as the shell takes it: the organization, or one workspace by its id. */
const target = z.object({
	target: z.union([
		z.literal('organization'),
		z.object({ workspace: z.string().trim().min(1) }).strict()
	])
});

/**
 * The upgrade of the organization or of one workspace (effort 857, requirement 3), mounted under
 * the organization at `upgrade`.
 *
 * **The preview and the run are `upgradeData`'s**, the flag both Rust commands ask of the acting
 * member's verified row; this is the earlier refusal, and Rust's decides, including the owner's
 * own key for a step that needs it and the owner not having opened this version yet. **What waits
 * is `member`**: any member reads it, because a capability gated on a step says why it is
 * unavailable, and who can upgrade, to whoever meets it (ticket 08). It names steps and nothing
 * else.
 */
export default {
	awaiting: procedure.member.query(async ({ ctx }): Promise<UpgradeAwaiting> => {
		return ctx.host.organization.upgrade.awaiting();
	}),
	preview: procedure
		.permitted('upgradeData')
		.input(target)
		.query(async ({ input, ctx }): Promise<UpgradePreview> => {
			return ctx.host.organization.upgrade.preview(input.target);
		}),
	run: procedure
		.permitted('upgradeData')
		.input(target)
		.mutation(async ({ input, ctx }): Promise<void> => {
			return ctx.host.organization.upgrade.run(input.target);
		})
};
