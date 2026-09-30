import type {
	GroupState,
	OrganizationConsentResult,
	OrganizationConsentStart,
	OrganizationCreated,
	OrganizationState
} from '$lib/organization/host';
import { procedure } from '$lib/api/trpc';
import z from 'zod';

import { USERNAME } from '../member/router';
import { CODE_LENGTH } from './connect';
import { ORGANIZATION_NAME_LIMIT, PASSWORD_FLOOR } from './setup';

/**
 * THE WAY IN'S PROCEDURES
 *
 * The consent, the first run, the connect to what the account already holds, and the two links
 * that admit a machine, mounted at the organization router's root by `../router.ts`. Every one of
 * them is `public`, for the reason that router gives.
 */
export default {
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
			return ctx.host.organization.consentDisconnect();
		})
	},
	/**
	 * Create the organization from the three things the setup walk collects, and the group where
	 * Turso left one to be asked for.
	 *
	 * **The bounds are the walk's own, stated here so a caller is refused before a round trip.**
	 * The form refuses the same on the field the reader typed in, and Rust refuses them again
	 * before it asks anything of Turso; this is the middle one, and it exists because a caller
	 * that is not the form should still be turned away before the host is reached.
	 *
	 * The group is optional, because almost every run has none: Rust tries the names it can work
	 * out before anybody is asked. Where one is given its only bound is that it says something,
	 * since what a group may be called is Turso's to say and refusing a shape here would be this
	 * layer inventing a rule about somebody else's names.
	 */
	create: procedure.public
		.input(
			z.object({
				name: z.string().trim().min(1).max(ORGANIZATION_NAME_LIMIT),
				username: USERNAME,
				password: z.string().min(PASSWORD_FLOOR),
				group: z.string().trim().min(1).optional()
			})
		)
		.mutation(async ({ input, ctx }): Promise<OrganizationCreated> => {
			return ctx.host.organization.create(
				input.name,
				input.username,
				input.password,
				input.group ?? null
			);
		}),
	/**
	 * What the consented Turso account already holds, and the connect that follows where it holds
	 * an organization (effort 828, requirement 14).
	 *
	 * **`public`, both, for the reason the consent and the create are**: they happen on a machine
	 * that holds nothing, before there is anybody to act as. The inspect reads and changes
	 * nothing; the connect takes the owner's username and password, and what comes back is where
	 * the machine stands. The password crosses in and nothing about it crosses back
	 * ([[rules/credentials]], *Client boundary*), which is the shape the sign-in already has.
	 *
	 * The floor is the walk's own, refused here before a round trip, as the create's is.
	 */
	groupInspect: procedure.public.mutation(async ({ ctx }): Promise<GroupState> => {
		return ctx.host.organization.groupInspect();
	}),
	connectExisting: procedure.public
		.input(
			z.object({
				username: USERNAME,
				password: z.string().min(PASSWORD_FLOOR)
			})
		)
		.mutation(async ({ input, ctx }): Promise<OrganizationState> => {
			return ctx.host.organization.connectExisting(input.username, input.password);
		}),
	/**
	 * Invitations: made by `member.linkMake` and opened at the wall. *They were listed here too
	 * until effort 826 put the pending one on the member's own row, revoked here until effort 828
	 * found nothing calling it, and copied again by their issuer until requirement 19 settled what
	 * a card offers.*
	 *
	 * **`accept` is `public` for the same reason `connect` is.** A person opening their link has
	 * no identity here yet; being admitted is what the call does. It reaches `ctx.host` and never
	 * `ctx.db`. The password floor is the first run's and the code is six characters, both
	 * refused here before a round trip for a caller that is not the screen; whether the link has
	 * lapsed, where the invitation stands, and whether the code and the link's own secret together
	 * open anything, are Rust's alone.
	 */
	invitation: {
		accept: procedure.public
			.input(
				z.object({
					link: z.string().trim().min(1),
					code: z.string().trim().length(CODE_LENGTH),
					password: z.string().min(PASSWORD_FLOOR)
				})
			)
			.mutation(async ({ input, ctx }): Promise<OrganizationState> => {
				return ctx.host.organization.invitation.accept(input.link, input.code, input.password);
			})
	},
	/**
	 * Opening a machine-kind link, which is the connect that spends it (effort 828, requirement
	 * 20). Making one is `member.linkMake`, beside the other kind, because one act makes a link for
	 * an account and the account's standing chooses which kind it is.
	 *
	 * **`public`, for the reason `invitation.accept` is**: it happens on a machine where nobody has
	 * signed in yet, so requiring an identity would be requiring the thing the call exists to make
	 * possible.
	 *
	 * The code is six characters here as it is on an invitation, refused before a round trip for a
	 * caller that is not the screen; whether the link has lapsed, where the row behind it stands,
	 * and whether the code and the link's own secret together open anything, are Rust's alone.
	 */
	machine: {
		connect: procedure.public
			.input(
				z.object({
					link: z.string().trim().min(1),
					code: z.string().trim().length(CODE_LENGTH)
				})
			)
			.mutation(async ({ input, ctx }): Promise<OrganizationState> => {
				return ctx.host.organization.machineConnect(input.link, input.code);
			})
	}
};
