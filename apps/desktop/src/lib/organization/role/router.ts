import type { OrganizationRole } from '$lib/organization/host';
import { refuse } from '$lib/api/refusal';
import { procedure } from '$lib/api/trpc';
import { firstWriteWithoutView } from '@rentable/workspace-permission';
import z from 'zod';

/** a role, by the id its row carries or the owner's constant. */
export const ROLE_ID = z.string().trim().min(1);

/**
 * a role's name. Whether it is taken is Rust's alone, since a custom role's name is sealed and only
 * an open vault can compare them; this is the earlier refusal of a blank one.
 */
export const ROLE_NAME = z.string().trim().min(1);

/** a set of flags as the one number a row stores, which never reaches bit 53. */
export const MASK = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

/**
 * Refuse a mask that adds, edits or deletes a kind of record without viewing it, naming the kind by
 * its own code (effort 838, requirement 6 as amended 2026-09-27). The rule is the package's
 * `firstWriteWithoutView`; this is the earlier of the two refusals, and Rust refuses the same with
 * the same reason whatever reaches it.
 */
export function refuseWriteWithoutView(mask: number): void {
	const kind = firstWriteWithoutView(mask);

	if (kind) {
		throw refuse(`host.${kind}NeedsViewing`);
	}
}

/**
 * The organization's roles (effort 838, requirements 3 and 4), which the organization section
 * of the settings area lists and edits.
 *
 * **Reading them is any signed-in member's**, as the members list is: what the roles are is not
 * a secret from the people who hold them. **Every write is `manageRoles`'s here and again in
 * Rust**, where the rest of requirement 7 is decided on verified rows: the role ranks below the
 * caller, a built-in role is not renamed, moved or deleted, and a mask carries only flags the
 * caller holds and none of the owner's. A mask that adds, edits or deletes a kind of record
 * without viewing it is refused here as well as there (requirement 6, as amended 2026-09-27);
 * whether a new mask leaves a holder's override doing so is Rust's, on the rows.
 */
export default {
	list: procedure.member.query(async ({ ctx }): Promise<OrganizationRole[]> => {
		return ctx.host.organization.roles();
	}),
	create: procedure
		.permitted('manageRoles')
		.input(z.object({ name: ROLE_NAME, mask: MASK, afterRoleId: ROLE_ID }))
		.mutation(async ({ input, ctx }): Promise<OrganizationRole> => {
			refuseWriteWithoutView(input.mask);

			return ctx.host.organization.role.create(input.name, input.mask, input.afterRoleId);
		}),
	rename: procedure
		.permitted('manageRoles')
		.input(z.object({ roleId: ROLE_ID, name: ROLE_NAME }))
		.mutation(async ({ input, ctx }): Promise<OrganizationRole> => {
			return ctx.host.organization.role.rename(input.roleId, input.name);
		}),
	setMask: procedure
		.permitted('manageRoles')
		.input(z.object({ roleId: ROLE_ID, mask: MASK }))
		.mutation(async ({ input, ctx }): Promise<OrganizationRole> => {
			refuseWriteWithoutView(input.mask);

			return ctx.host.organization.role.setMask(input.roleId, input.mask);
		}),
	move: procedure
		.permitted('manageRoles')
		.input(z.object({ roleId: ROLE_ID, afterRoleId: ROLE_ID }))
		.mutation(async ({ input, ctx }): Promise<OrganizationRole> => {
			return ctx.host.organization.role.move(input.roleId, input.afterRoleId);
		}),
	delete: procedure
		.permitted('manageRoles')
		.input(z.object({ roleId: ROLE_ID }))
		.mutation(async ({ input, ctx }): Promise<void> => {
			return ctx.host.organization.role.remove(input.roleId);
		})
};
