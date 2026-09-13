import type {
	Invited,
	LockOutCost,
	MemberRemoved,
	OrganizationConsentResult,
	OrganizationConsentStart,
	OrganizationCreated,
	OrganizationInvitation,
	OrganizationMember,
	OrganizationState,
	OrganizationWorkspace
} from '$lib/platform/tauri';
import { procedure, router } from '$lib/api/trpc';
import z from 'zod';

import { ORGANIZATION_NAME_LIMIT, PASSWORD_FLOOR } from './setup';
import { USERNAME_MAX, USERNAME_MIN, USERNAME_PATTERN } from './username-form';

/**
 * a username as requirement 21 of effort 824 bounds it, read off the one definition the forms
 * share (`./username-form.ts`). Rust holds the rule and the sentence
 * (`invite::validate_username`); this is the earlier refusal, before the round trip, and it says
 * nothing a form would show. Whether a username is taken is Rust's alone, since usernames are
 * sealed and only an open vault can compare them.
 */
const USERNAME = z.string().trim().min(USERNAME_MIN).max(USERNAME_MAX).regex(USERNAME_PATTERN);

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
			return ctx.host.organization.consentDisconnect();
		})
	},
	/**
	 * Connect this machine to the organization a link names, and forget the one it holds.
	 *
	 * **`public`, both, because both happen at the wall.** A connect is offered to a machine that
	 * holds nothing, before there is anybody to act as; a disconnect is offered on the wall while
	 * signed out as well as on the organization page, and the host signs out first where somebody
	 * is in. Neither reaches `ctx.db`. The one confirm before a disconnect is the screen's.
	 */
	connect: procedure.public
		.input(z.object({ link: z.string().trim().min(1) }))
		.mutation(async ({ input, ctx }): Promise<OrganizationState> => {
			return ctx.host.organization.connect(input.link);
		}),
	disconnect: procedure.public.mutation(async ({ ctx }): Promise<OrganizationState> => {
		return ctx.host.organization.disconnect();
	}),
	/**
	 * Create the organization from the three things the setup walk collects.
	 *
	 * **The bounds are the walk's own, stated here so a caller is refused before a round trip.**
	 * The form refuses the same on the field the reader typed in, and Rust refuses them again
	 * before it asks anything of Turso; this is the middle one, and it exists because a caller
	 * that is not the form should still be turned away before the host is reached.
	 */
	create: procedure.public
		.input(
			z.object({
				name: z.string().trim().min(1).max(ORGANIZATION_NAME_LIMIT),
				username: USERNAME,
				password: z.string().min(PASSWORD_FLOOR)
			})
		)
		.mutation(async ({ input, ctx }): Promise<OrganizationCreated> => {
			return ctx.host.organization.create(input.name, input.username, input.password);
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
	},
	/**
	 * Members and their invitations, which is the dashboard.
	 *
	 * **Inviting is `permitted('inviteMember')` here and refused again in Rust**, on the member's
	 * verified row; this is the earlier of the two refusals, made so a caller is turned away before
	 * a round trip, and never the deciding one. Listing is any signed-in member's: who is in the
	 * organization is not a secret from the people in it.
	 */
	member: {
		list: procedure.member.query(async ({ ctx }): Promise<OrganizationMember[]> => {
			return ctx.host.organization.member.list();
		}),
		invite: procedure
			.permitted('inviteMember')
			.input(
				z.object({
					username: USERNAME,
					role: z.enum(['administrator', 'member']),
					workspaceIds: z.array(z.string().trim().min(1))
				})
			)
			.mutation(async ({ input, ctx }): Promise<Invited> => {
				return ctx.host.organization.member.invite(input.username, input.role, input.workspaceIds);
			}),
		/**
		 * Removal, at one of two speeds. **`lockOut` defaults to false here as well as in Rust**,
		 * so the destructive path is chosen rather than fallen into by any caller.
		 */
		remove: procedure
			.permitted('removeMember')
			.input(z.object({ memberId: z.string().trim().min(1), lockOut: z.boolean().default(false) }))
			.mutation(async ({ input, ctx }): Promise<MemberRemoved> => {
				return ctx.host.organization.member.remove(input.memberId, input.lockOut);
			}),
		lockOutCost: procedure
			.permitted('removeMember')
			.input(z.object({ memberId: z.string().trim().min(1) }))
			.query(async ({ input, ctx }): Promise<LockOutCost> => {
				return ctx.host.organization.member.lockOutCost(input.memberId);
			}),
		/**
		 * A rename, held to the same act and the same username rules as an invitation, because
		 * it changes the one thing an invitation named. Whether the username is taken, and whether
		 * the row is the caller's own, are Rust's to refuse.
		 */
		rename: procedure
			.permitted('inviteMember')
			.input(z.object({ memberId: z.string().trim().min(1), username: USERNAME }))
			.mutation(async ({ input, ctx }): Promise<OrganizationMember> => {
				return ctx.host.organization.member.rename(input.memberId, input.username);
			})
	},
	invitation: {
		list: procedure.member.query(async ({ ctx }): Promise<OrganizationInvitation[]> => {
			return ctx.host.organization.invitation.list();
		}),
		revoke: procedure
			.permitted('inviteMember')
			.input(z.object({ invitationId: z.string().trim().min(1) }))
			.mutation(async ({ input, ctx }): Promise<void> => {
				return ctx.host.organization.invitation.revoke(input.invitationId);
			}),
		reissue: procedure
			.permitted('inviteMember')
			.input(z.object({ memberId: z.string().trim().min(1) }))
			.mutation(async ({ input, ctx }): Promise<Invited> => {
				return ctx.host.organization.resetMember(input.memberId);
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
});
