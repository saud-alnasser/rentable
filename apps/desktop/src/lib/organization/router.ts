import type {
	FreshCode,
	Invited,
	LockOutCost,
	MemberRemoved,
	OrganizationConsentResult,
	OrganizationConsentStart,
	OrganizationCreated,
	OrganizationMember,
	OrganizationState,
	OrganizationWorkspace,
	SessionsEnded
} from '$lib/platform/tauri';
import { procedure, router } from '$lib/api/trpc';
import z from 'zod';

import { CODE_LENGTH } from './connect';
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
	 * **`member` for creating and for removing, and the owner check is Rust's.** There is no
	 * `createWorkspace` and no `deleteWorkspace` act in `packages/workspace-permission`, because
	 * neither was ever an act a role could be given: each needs the platform authority only the
	 * owner's machine holds, and the shell refuses anybody else before any request, with a sentence
	 * naming the owner. What this side can say is that somebody is signed in. *Removing was
	 * `permitted('deleteWorkspace')` until effort 826 took the act out of the table, where it had
	 * been a flag that granting could not deliver.*
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
			.permitted('grantWorkspace')
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
		remove: procedure.member
			.input(z.object({ workspaceId: z.string().trim().min(1) }))
			.mutation(async ({ input, ctx }): Promise<void> => {
				return ctx.host.organization.workspace.remove(input.workspaceId);
			}),
		renewCredentials: procedure.member.mutation(async ({ ctx }): Promise<number> => {
			return ctx.host.organization.workspace.renewCredentials();
		})
	},
	/**
	 * Members and their invitations, which is the members list.
	 *
	 * **Inviting is `permitted('inviteMember')` here and refused again in Rust**, on the member's
	 * verified row; this is the earlier of the two refusals, made so a caller is turned away before
	 * a round trip, and never the deciding one. Listing is any signed-in member's: who is in the
	 * organization is not a secret from the people in it, and since effort 826 that one list
	 * carries the pending invitations too. Whether a read-only grant can be minted
	 * here is Rust's alone, since it turns on the owner's authority and not on a bit.
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
					workspaces: z.array(
						z.object({
							id: z.string().trim().min(1),
							access: z.enum(['full-access', 'read-only'])
						})
					)
				})
			)
			.mutation(async ({ input, ctx }): Promise<Invited> => {
				return ctx.host.organization.member.invite(input.username, input.role, input.workspaces);
			}),
		/**
		 * A reset: a fresh link for a member who already has a row. It is `resetPassword` rather
		 * than `inviteMember` from effort 826 on, because what it hands somebody is a way back into
		 * an account that exists rather than a new one, and requirement 4 made those two separate
		 * things to be trusted with. *`invitation.reissue` until the same effort.*
		 */
		reset: procedure
			.permitted('resetPassword')
			.input(z.object({ memberId: z.string().trim().min(1) }))
			.mutation(async ({ input, ctx }): Promise<Invited> => {
				return ctx.host.organization.member.reset(input.memberId);
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
		 * A rename, held to its own act and to the same username rules as an invitation. It was
		 * `inviteMember` until effort 826 gave `renameMember` a bit of its own, on the reading that
		 * correcting a spelling and making an account are different things to be trusted with.
		 * Whether the username is taken, and whether the row is the caller's own, are Rust's to
		 * refuse.
		 */
		rename: procedure
			.permitted('renameMember')
			.input(z.object({ memberId: z.string().trim().min(1), username: USERNAME }))
			.mutation(async ({ input, ctx }): Promise<OrganizationMember> => {
				return ctx.host.organization.member.rename(input.memberId, input.username);
			}),
		/**
		 * A role and the acts that go with it, written together. This side refuses a caller whose
		 * row does not carry `changeRole`; whether the row is the caller's own or the owner's, and
		 * whether the change hands out an act that signs rows, are Rust's, because the second of
		 * those turns on the organization key rather than on a bit.
		 */
		changeRole: procedure
			.permitted('changeRole')
			.input(
				z.object({
					memberId: z.string().trim().min(1),
					role: z.enum(['administrator', 'member']),
					permissions: z.number().int().min(0)
				})
			)
			.mutation(async ({ input, ctx }): Promise<OrganizationMember> => {
				return ctx.host.organization.member.changeRole(
					input.memberId,
					input.role,
					input.permissions
				);
			}),
		/**
		 * Sign a member out of every machine (effort 826, requirement 22).
		 *
		 * **`resetPassword` and no act of its own**, on the reading requirement 22 states: whoever
		 * may hand somebody a fresh way into their account may end the ways in that are already
		 * open. Whether the row is the caller's own, which is `session.endElsewhere`, and whether
		 * it is the owner's, which is nobody else's, are Rust's to refuse.
		 *
		 * **What comes back says whether the bump went out**, which is what the announcement
		 * turns on: a machine with no connection writes the number on its own replica and the
		 * member's other machines stay open until it reaches the organization database.
		 */
		endSessions: procedure
			.permitted('resetPassword')
			.input(z.object({ memberId: z.string().trim().min(1) }))
			.mutation(async ({ input, ctx }): Promise<SessionsEnded> => {
				return ctx.host.organization.member.endSessions(input.memberId);
			})
	},
	/**
	 * Invitations: revoked by the act that makes them, copied again by their issuer, and opened at
	 * the wall. *They were listed here too until effort 826 put the pending one on the member's
	 * own row.*
	 *
	 * **`accept` is `public` for the same reason `connect` is.** A person opening their link has
	 * no identity here yet; being admitted is what the call does. It reaches `ctx.host` and never
	 * `ctx.db`. The password floor is the first run's and the code is six characters, both
	 * refused here before a round trip for a caller that is not the screen; whether the invitation
	 * stands, and whether the link's secret and the code together open anything, are Rust's alone.
	 */
	invitation: {
		revoke: procedure
			.permitted('inviteMember')
			.input(z.object({ invitationId: z.string().trim().min(1) }))
			.mutation(async ({ input, ctx }): Promise<void> => {
				return ctx.host.organization.invitation.revoke(input.invitationId);
			}),
		link: procedure
			.permitted('inviteMember')
			.input(z.object({ invitationId: z.string().trim().min(1) }))
			.mutation(async ({ input, ctx }): Promise<string> => {
				return ctx.host.organization.invitation.link(input.invitationId);
			}),
		/**
		 * A fresh confirmation code, under the act that makes invitations. Whether the caller is
		 * the one who issued this invitation is Rust's, because it turns on whose key the row's
		 * sealed secret opens for; anybody else is offered a new link instead, which is a reset.
		 */
		code: procedure
			.permitted('inviteMember')
			.input(z.object({ invitationId: z.string().trim().min(1) }))
			.mutation(async ({ input, ctx }): Promise<FreshCode> => {
				return ctx.host.organization.invitation.code(input.invitationId);
			}),
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
	 * The reader's own sessions on their other machines, ended from the you section (effort 826,
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
});
