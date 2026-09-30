import type {
	LockOutCost,
	MadeLink,
	MemberRemoved,
	MemberStanding,
	OrganizationHost,
	OrganizationMember,
	SessionsEnded,
	UnreachableWorkspace
} from '$lib/organization/host';
import { refuse } from '$lib/api/refusal';
import { procedure } from '$lib/api/trpc';
import {
	EVERY_FLAG,
	RECORD_FLAGS,
	WRITE_FLAGS,
	effective,
	maskOf,
	permits,
	pinnedIn
} from '@rentable/workspace-permission';
import z from 'zod';

import { MASK, ROLE_ID, refuseWriteWithoutView } from '../role/router';
import { USERNAME_MAX, USERNAME_MIN, USERNAME_PATTERN } from './username-form';

/**
 * a username as requirement 21 of effort 824 bounds it, read off the one definition the forms
 * share (`./username-form.ts`). Rust holds the rule and the sentence
 * (`invite::validate_username`); this is the earlier refusal, before the round trip, and it says
 * nothing a form would show. Whether a username is taken is Rust's alone, since usernames are
 * sealed and only an open vault can compare them.
 */
export const USERNAME = z
	.string()
	.trim()
	.min(USERNAME_MIN)
	.max(USERNAME_MAX)
	.regex(USERNAME_PATTERN);

/** the part of the host the helpers below reach: the organization's own port. */
type Host = { organization: OrganizationHost };

/**
 * The mask of a role by id, or `null` where the organization holds none by that id, which Rust
 * refuses by name.
 */
async function roleMask(host: Host, roleId: string): Promise<number | null> {
	const roles = await host.organization.roles();

	return roles.find((role) => role.id === roleId)?.mask ?? null;
}

/**
 * Refuse a role and an override whose effective permissions add, edit or delete a kind of record
 * without viewing it. Where the role is not one the organization holds, Rust's refusal is the one
 * that names it.
 */
async function refuseEffectiveWriteWithoutView(
	host: Host,
	roleId: string,
	override: number
): Promise<void> {
	const mask = await roleMask(host, roleId);

	if (mask !== null) {
		refuseWriteWithoutView(effective(mask, override));
	}
}

/**
 * Accounts and their invitations, which is the members section.
 *
 * **Making an account is `permitted('inviteMember', 'grantWorkspace')`, a reset
 * `permitted('resetPassword', 'grantWorkspace')`, and making a link is `inviteMember` or
 * `resetPassword`, and each is refused again in Rust**, on the member's verified row; this is
 * the earlier of the two refusals, made so a caller is turned away before a round trip, and
 * never the deciding one. `grantWorkspace` is asked because each writes the account's grant on
 * the organization database, which is that flag's row (effort 838); a link asks it in Rust alone,
 * and only for an account whose password is not set, since only that link builds the account
 * again, which is the account's state rather than anything the call carries. Listing is any
 * signed-in member's: who is in the organization is not a secret from the people in it, and since
 * effort 826 that one list carries the pending invitations too. Whether a read-only grant can be
 * minted here is Rust's alone, since it turns on the owner's authority and not on a bit.
 */
export default {
	list: procedure.member.query(async ({ ctx }): Promise<OrganizationMember[]> => {
		return ctx.host.organization.member.list();
	}),
	/**
	 * Where each account stands, for the line the directory draws under a name (effort 828,
	 * requirement 19). Any signed-in member's, like the list beside it: who is in the
	 * organization and whether they are connected is not a secret from the people in it, and
	 * the directory that draws it is offered to a holder of an administration act anyway.
	 */
	standings: procedure.member.query(async ({ ctx }): Promise<MemberStanding[]> => {
		return ctx.host.organization.member.standings();
	}),
	create: procedure
		.permitted('inviteMember', 'grantWorkspace')
		.input(
			z.object({
				username: USERNAME,
				roleId: ROLE_ID,
				override: MASK,
				workspaces: z.array(
					z.object({
						id: z.string().trim().min(1),
						access: z.enum(['full-access', 'read-only'])
					})
				)
			})
		)
		.mutation(async ({ input, ctx }): Promise<OrganizationMember> => {
			await refuseEffectiveWriteWithoutView(ctx.host, input.roleId, input.override);

			return ctx.host.organization.member.create(
				input.username,
				input.roleId,
				input.override,
				input.workspaces
			);
		}),
	/**
	 * The one link act (effort 828, requirement 20). It is `inviteMember`'s **or**
	 * `resetPassword`'s: what it hands somebody is the way a machine joins an account, which is
	 * what making an account was always half of, and it is also the only thing that restores an
	 * account whose password `unsetPassword` beside it took away. Held to the first alone, a
	 * member widened with the second and not the first could lock somebody out and not let them
	 * back in. *The human struck that risk on 2026-09-16.* Which kind of link it is is Rust's,
	 * read off the account's row; nothing about where the account stands refuses one, because
	 * an account is held on as many machines as it is given links for.
	 * *`invitation.reissue`, then `member.reset`, then this.*
	 */
	linkMake: procedure
		.permittedAny('inviteMember', 'resetPassword')
		.input(z.object({ memberId: z.string().trim().min(1) }))
		.mutation(async ({ input, ctx }): Promise<MadeLink> => {
			return ctx.host.organization.member.linkMake(input.memberId);
		}),
	/**
	 * A reset: the account's password unset, so the next link asks for a new one. It is
	 * `resetPassword` rather than `inviteMember` from effort 826 on, because taking somebody's
	 * way in away is a different thing to be trusted with than making an account. What comes
	 * back names the workspaces it could not carry over. *`member.reset` handed a link back
	 * until effort 828 made the link its own act.*
	 */
	unsetPassword: procedure
		.permitted('resetPassword', 'grantWorkspace')
		.input(z.object({ memberId: z.string().trim().min(1) }))
		.mutation(async ({ input, ctx }): Promise<UnreachableWorkspace[]> => {
			return ctx.host.organization.member.unsetPassword(input.memberId);
		}),
	/**
	 * Removal, at one of two speeds. **`lockOut` defaults to false here as well as in Rust**,
	 * so the destructive path is chosen rather than fallen into by any caller.
	 *
	 * **`removeMember`, and the owner's `lockOut` as well where the removal locks out**, read
	 * off the input as Rust reads it (`member/removal.rs`): rotating the credentials the member held
	 * needs the platform authority only the owner's machine holds.
	 */
	remove: procedure
		.permittedBy(
			['removeMember', 'lockOut'],
			z.object({ memberId: z.string().trim().min(1), lockOut: z.boolean().default(false) }),
			({ lockOut }) => (lockOut ? ['removeMember', 'lockOut'] : ['removeMember'])
		)
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
	 * The role a member holds (effort 838, requirement 5). This side refuses a caller whose row
	 * does not carry `assignRole`; whether the row is the caller's own or the owner's, whether
	 * the member and the role rank below the caller, and whether every flag the change moves is
	 * one the caller holds, are Rust's, because each turns on verified rows this side does not
	 * read. *It was `changeRole`, which wrote a word and seven acts together, until effort 838.*
	 *
	 * **An override may ride with the role**, and then the two are one act, so the flags held
	 * are asked of both together (ticket 14 of effort 838). **Left out, the override the member
	 * carried is cleared**, so they hold the role exactly (requirement 6, as amended
	 * 2026-09-27); one left standing asks `overrideMember` too, in Rust for the same reason.
	 * What the member ends up with is refused here where it adds, edits or deletes a kind of
	 * record without viewing it.
	 */
	assignRole: procedure
		.permitted('assignRole')
		.input(
			z.object({
				memberId: z.string().trim().min(1),
				roleId: ROLE_ID,
				override: MASK.optional()
			})
		)
		.mutation(async ({ input, ctx }): Promise<OrganizationMember> => {
			await refuseEffectiveWriteWithoutView(ctx.host, input.roleId, input.override ?? 0);

			return ctx.host.organization.member.assignRole(input.memberId, input.roleId, input.override);
		}),
	/**
	 * The flags switched for one member alone (requirement 6), held to `overrideMember` here and
	 * to the rest of requirement 7 in Rust, as `assignRole` is. What the member ends up with,
	 * their role's mask with the override switched, is refused here where it adds, edits or
	 * deletes a kind of record without viewing it; a member this side does not find is Rust's to
	 * refuse by name.
	 */
	setOverride: procedure
		.permitted('overrideMember')
		.input(z.object({ memberId: z.string().trim().min(1), override: MASK }))
		.mutation(async ({ input, ctx }): Promise<OrganizationMember> => {
			const members = await ctx.host.organization.member.list();
			const member = members.find((held) => held.id === input.memberId);

			if (member) {
				await refuseEffectiveWriteWithoutView(ctx.host, member.roleId, input.override);
			}

			return ctx.host.organization.member.setOverride(input.memberId, input.override);
		}),
	/**
	 * What is pinned for one member in one workspace they are in, and which of it is on (effort
	 * 838, requirement 12 as amended a third time, and at review round one), held to
	 * `overrideMember` here and to the rest in Rust, as `setOverride` is; nothing pinned clears
	 * it. A pin naming a flag that is not a record flag, or a flag granted and not pinned, is
	 * refused here first, and so is what the member would end up with there where it adds,
	 * edits or deletes a kind of record without viewing it. Whether they hold a grant on the
	 * workspace is Rust's to refuse by name.
	 */
	setWorkspaceOverride: procedure
		.permitted('overrideMember')
		.input(
			z.object({
				memberId: z.string().trim().min(1),
				workspaceId: z.string().trim().min(1),
				pinned: MASK,
				granted: MASK
			})
		)
		.mutation(async ({ input, ctx }): Promise<OrganizationMember> => {
			const records = RECORD_FLAGS.filter((flag) => permits(input.pinned, flag));

			if (
				input.pinned !== maskOf(...records) ||
				input.granted !== maskOf(...records.filter((flag) => permits(input.granted, flag)))
			) {
				throw refuse('host.recordFlagsOnly');
			}

			const members = await ctx.host.organization.member.list();
			const member = members.find((held) => held.id === input.memberId);

			// only a write turned on there is refused for its view: one the layers beneath carry
			// without it is dropped where it is read, as Rust judges it.
			if (member) {
				const result = pinnedIn(member.permissions, input.pinned, input.granted);
				const turned = EVERY_FLAG.filter(
					(flag) =>
						permits(result, flag) && (!WRITE_FLAGS.includes(flag) || permits(input.granted, flag))
				);

				refuseWriteWithoutView(maskOf(...turned));
			}

			return ctx.host.organization.member.setWorkspaceOverride(
				input.memberId,
				input.workspaceId,
				input.pinned,
				input.granted
			);
		}),
	/**
	 * Offer the organization to another account: the first of the two acts a handover is
	 * (effort 828, requirement 22).
	 *
	 * **`transferOwnership`, the owner's flag**, which no role and no override carries, and
	 * which Rust asks of the owner's verified row; this is the earlier refusal. Whether the
	 * password opens the owner's vault and whether the account named has a password of its own
	 * are Rust's alone, exactly as `organization.delete` leaves them. *It was `member` until
	 * ticket 17 of effort 838, on the reading that being the owner was what a password opened
	 * rather than a bit on a row.*
	 *
	 * The password crosses in and nothing about it crosses back ([[rules/credentials]],
	 * *Client boundary*). The floor is not applied: it is being checked against a vault rather
	 * than chosen, which is the reading `organization.delete` and `password.change` take of a
	 * current password.
	 */
	offerOwnership: procedure
		.permitted('transferOwnership')
		.input(z.object({ memberId: z.string().trim().min(1), password: z.string().min(1) }))
		.mutation(async ({ input, ctx }): Promise<OrganizationMember> => {
			return ctx.host.organization.member.offerOwnership(input.memberId, input.password);
		}),
	/**
	 * Take the offer back, under the same flag, and it takes nothing: nothing is unsealed and
	 * there is one standing offer or none, so naming which would be naming something this side
	 * would have to have read.
	 */
	withdrawOffer: procedure
		.permitted('transferOwnership')
		.mutation(async ({ ctx }): Promise<void> => {
			return ctx.host.organization.member.withdrawOffer();
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
};
