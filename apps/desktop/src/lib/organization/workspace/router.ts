import type { OrganizationWorkspace } from '$lib/organization/host';
import { procedure } from '$lib/api/trpc';
import z from 'zod';

import { ORGANIZATION_NAME_LIMIT } from '../setup/setup';

/**
 * A workspace: created by the owner, opened by whoever holds a grant, granted and removed by
 * whoever's row carries the act.
 *
 * **Creating, removing and renewing credentials are the owner's flags**, `createWorkspace`,
 * `deleteWorkspace` and `renewCredentials` in `packages/workspace-permission`, which no role
 * and no override carries: each needs the platform authority only the owner's machine holds.
 * Rust asks the same flag of the owner's verified row and refuses anybody else before any
 * request, with a sentence naming the owner; this is the earlier refusal. Opening is `member`,
 * because it is the reader's own act on a workspace they hold a grant on, and whether they do
 * is Rust's. *Creating and removing were `member` until ticket 17 of effort 838, on the reading
 * that the package had no act for either: effort 826 took `deleteWorkspace` out of the table,
 * where it had been a flag that granting could not deliver, and effort 838 put both back as
 * the owner's.*
 */
export default {
	create: procedure
		.permitted('createWorkspace')
		.input(z.object({ name: z.string().trim().min(1).max(ORGANIZATION_NAME_LIMIT) }))
		.mutation(async ({ input, ctx }): Promise<OrganizationWorkspace> => {
			return ctx.host.organization.workspace.create(input.name);
		}),
	open: procedure.member
		.input(z.object({ workspaceId: z.string().trim().min(1) }))
		.mutation(async ({ input, ctx }): Promise<OrganizationWorkspace> => {
			return ctx.host.organization.workspace.open(input.workspaceId);
		}),
	grant: procedure
		.permitted('grantWorkspace')
		.input(
			z.object({
				workspaceId: z.string().trim().min(1),
				memberId: z.string().trim().min(1),
				access: z.enum(['full-access', 'read-only'])
			})
		)
		.mutation(async ({ input, ctx }): Promise<void> => {
			return ctx.host.organization.workspace.grant(input.workspaceId, input.memberId, input.access);
		}),
	/**
	 * A withdrawal, under the act that gives. It takes one grant back and mints nothing, so
	 * the credential the member already holds works until it expires; cutting somebody off at
	 * once is the lock-out on a removal, and that is the owner's.
	 */
	withdraw: procedure
		.permitted('grantWorkspace')
		.input(
			z.object({
				workspaceId: z.string().trim().min(1),
				memberId: z.string().trim().min(1)
			})
		)
		.mutation(async ({ input, ctx }): Promise<void> => {
			return ctx.host.organization.workspace.withdraw(input.workspaceId, input.memberId);
		}),
	remove: procedure
		.permitted('deleteWorkspace')
		.input(z.object({ workspaceId: z.string().trim().min(1) }))
		.mutation(async ({ input, ctx }): Promise<void> => {
			return ctx.host.organization.workspace.remove(input.workspaceId);
		}),
	renewCredentials: procedure
		.permitted('renewCredentials')
		.mutation(async ({ ctx }): Promise<number> => {
			return ctx.host.organization.workspace.renewCredentials();
		})
};
