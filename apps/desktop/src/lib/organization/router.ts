import type {
	OrganizationConsentResult,
	OrganizationConsentStart,
	OrganizationCreated,
	OrganizationWorkspace
} from '$lib/platform/tauri';
import { procedure, router } from '$lib/api/trpc';
import z from 'zod';

import { ORGANIZATION_NAME_LIMIT, PASSWORD_FLOOR } from './setup';

/**
 * ORGANIZATION ROUTER
 *
 * an organization on a Turso account the customer owns, mounted by the app router at
 * `app.organization`.
 *
 * **`public`, all of it, and for the same reason the sync router's state read is.** Everything
 * here happens before there is anybody to act as: the consent and the first run are how a person
 * comes to have an identity in an organization at all, so a procedure that required one would be
 * answerable only after the thing it exists to do. Each reaches `ctx.host` and never `ctx.db`,
 * which is the test for `public` [[rules/api-layer]] states.
 *
 * **What crosses is outcomes.** The consent yields an address to open and a status to poll; the
 * first run yields an id and a link. The token, the keys and the password stay on the other side
 * of the boundary ([[rules/credentials]], *Client boundary*).
 */
export const organization = router({
	consent: {
		begin: procedure.public.mutation(async ({ ctx }): Promise<OrganizationConsentStart> => {
			return ctx.host.organization.consentBegin();
		}),
		result: procedure.public
			.input(z.object({ sessionId: z.string().trim().min(1) }))
			.query(async ({ input, ctx }): Promise<OrganizationConsentResult> => {
				return ctx.host.organization.consentResult(input.sessionId);
			}),
		disconnect: procedure.public.mutation(async ({ ctx }): Promise<void> => {
			return ctx.host.organization.disconnect();
		})
	},
	/**
	 * Create the organization from the two things the setup walk collects.
	 *
	 * **The bounds are the walk's own, stated here so a caller is refused before a round trip.**
	 * The form refuses the same two on the field the reader typed in, and Rust refuses them again
	 * before it asks anything of Turso; this is the middle one, and it exists because a caller
	 * that is not the form should still be turned away before the host is reached.
	 */
	create: procedure.public
		.input(
			z.object({
				name: z.string().trim().min(1).max(ORGANIZATION_NAME_LIMIT),
				password: z.string().min(PASSWORD_FLOOR)
			})
		)
		.mutation(async ({ input, ctx }): Promise<OrganizationCreated> => {
			return ctx.host.organization.create(input.name, input.password);
		}),
	/**
	 * A workspace: created by the owner, opened by whoever holds a grant, granted and removed by
	 * whoever's row carries the act.
	 *
	 * **`member` for creating, and the owner check is Rust's.** There is no `createWorkspace` act in
	 * `packages/workspace-permission`, because creating one was never an act a role could be given:
	 * it needs the platform authority only the owner's machine holds, and the shell refuses anybody
	 * else before any request. What this side can say is that somebody is signed in.
	 */
	workspace: {
		create: procedure.member
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
			.permitted('inviteMember')
			.input(
				z.object({
					workspaceId: z.string().trim().min(1),
					memberId: z.string().trim().min(1),
					access: z.enum(['full-access', 'read-only'])
				})
			)
			.mutation(async ({ input, ctx }): Promise<void> => {
				return ctx.host.organization.workspace.grant(
					input.workspaceId,
					input.memberId,
					input.access
				);
			}),
		remove: procedure
			.permitted('deleteWorkspace')
			.input(z.object({ workspaceId: z.string().trim().min(1) }))
			.mutation(async ({ input, ctx }): Promise<void> => {
				return ctx.host.organization.workspace.remove(input.workspaceId);
			}),
		renewCredentials: procedure.member.mutation(async ({ ctx }): Promise<number> => {
			return ctx.host.organization.workspace.renewCredentials();
		})
	}
});
