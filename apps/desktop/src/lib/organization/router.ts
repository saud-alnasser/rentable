import type {
	GroupState,
	LockOutCost,
	MadeLink,
	MemberRemoved,
	MemberStanding,
	OrganizationConsentResult,
	OrganizationConsentStart,
	OrganizationCreated,
	OrganizationMember,
	OrganizationMark,
	OrganizationRole,
	OrganizationState,
	OrganizationWorkspace,
	SessionsEnded,
	UnreachableWorkspace
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

/** a role, by the id its row carries or the owner's constant. */
const ROLE_ID = z.string().trim().min(1);

/**
 * a role's name. Whether it is taken is Rust's alone, since a custom role's name is sealed and only
 * an open vault can compare them; this is the earlier refusal of a blank one.
 */
const ROLE_NAME = z.string().trim().min(1);

/** a set of flags as the one number a row stores, which never reaches bit 53. */
const MASK = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

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
	 * Forget the organization this machine holds.
	 *
	 * **`public`, because it happens at the wall.** A disconnect is offered on the wall while
	 * signed out as well as on the organization page, and the host signs out first where somebody
	 * is in. It does not reach `ctx.db`. The one confirm before it is the screen's.
	 *
	 * *A `connect` stood beside it, taking the organization's own link, until effort 828's
	 * requirement 16 retired that link. Every link needs its code now, and the acts that take one
	 * are `invitation.accept` and `machine.connect`, which the connect screen calls on the host
	 * directly for the refusals they name.*
	 */
	disconnect: procedure.public.mutation(async ({ ctx }): Promise<OrganizationState> => {
		return ctx.host.organization.disconnect();
	}),
	/**
	 * Accept the organization that was offered to this reader: the second of the two acts a
	 * handover is (effort 828, requirement 22).
	 *
	 * **`member`, and every judgement is Rust's.** Whether an offer stands for this reader,
	 * whether the password opens their vault, and whether what was sealed onto their row is the
	 * key this machine holds are all answered where the keys are. What this side can say is that
	 * somebody is signed in and that a password was typed, which is the shape `organization.delete`
	 * has and for the same reason.
	 *
	 * The floor is not applied, as it is not on a current password anywhere else here. What comes
	 * back is the whole state, because this reader is the owner from here on and every section the
	 * settings area offers is drawn off it.
	 */
	ownershipAccept: procedure.member
		.input(z.object({ password: z.string().min(1) }))
		.mutation(async ({ input, ctx }): Promise<OrganizationState> => {
			return ctx.host.organization.ownershipAccept(input.password);
		}),
	/**
	 * Delete the organization: every workspace database and the organization's own directory go
	 * from the owner's Turso account, and this machine forgets what it held (effort 828,
	 * requirement 18).
	 *
	 * **`member`, and the owner check is Rust's**, which is the shape `workspace.create` and
	 * `workspace.remove` already have and for the same reason: there is no act in
	 * `packages/workspace-permission` a role could be given for this, because it needs the
	 * platform authority only the owner's machine holds. What this side can say is that somebody
	 * is signed in and that a password was typed; whether it opens the owner's vault is Rust's
	 * alone, and the password crosses in and nothing about it crosses back ([[rules/credentials]],
	 * *Client boundary*).
	 *
	 * The floor is not applied here. The password is being checked against a vault rather than
	 * chosen, and an organization sealed before the floor moved would be undeletable by its own
	 * owner if this refused it, which is the same reading `password.change` takes of the current
	 * password.
	 */
	delete: procedure.member
		.input(z.object({ password: z.string().min(1) }))
		.mutation(async ({ input, ctx }): Promise<OrganizationState> => {
			return ctx.host.organization.delete(input.password);
		}),
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
	 * Accounts and their invitations, which is the members section.
	 *
	 * **Making an account is `permitted('inviteMember')` and making a link is that act or
	 * `resetPassword`, and both are refused again in Rust**, on the member's verified row; this is
	 * the earlier of the two refusals, made so a caller is turned away before
	 * a round trip, and never the deciding one. Listing is any signed-in member's: who is in the
	 * organization is not a secret from the people in it, and since effort 826 that one list
	 * carries the pending invitations too. Whether a read-only grant can be minted
	 * here is Rust's alone, since it turns on the owner's authority and not on a bit.
	 */
	member: {
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
			.permitted('inviteMember')
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
			.permitted('resetPassword')
			.input(z.object({ memberId: z.string().trim().min(1) }))
			.mutation(async ({ input, ctx }): Promise<UnreachableWorkspace[]> => {
				return ctx.host.organization.member.unsetPassword(input.memberId);
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
		 * The role a member holds (effort 838, requirement 5). This side refuses a caller whose row
		 * does not carry `assignRole`; whether the row is the caller's own or the owner's, whether
		 * the member and the role rank below the caller, and whether every flag the change moves is
		 * one the caller holds, are Rust's, because each turns on verified rows this side does not
		 * read. *It was `changeRole`, which wrote a word and seven acts together, until effort 838.*
		 */
		assignRole: procedure
			.permitted('assignRole')
			.input(z.object({ memberId: z.string().trim().min(1), roleId: ROLE_ID }))
			.mutation(async ({ input, ctx }): Promise<OrganizationMember> => {
				return ctx.host.organization.member.assignRole(input.memberId, input.roleId);
			}),
		/**
		 * The flags switched for one member alone (requirement 6), held to `overrideMember` here and
		 * to the rest of requirement 7 in Rust, as `assignRole` is.
		 */
		setOverride: procedure
			.permitted('overrideMember')
			.input(z.object({ memberId: z.string().trim().min(1), override: MASK }))
			.mutation(async ({ input, ctx }): Promise<OrganizationMember> => {
				return ctx.host.organization.member.setOverride(input.memberId, input.override);
			}),
		/**
		 * Offer the organization to another account: the first of the two acts a handover is
		 * (effort 828, requirement 22).
		 *
		 * **The owner's, and this side cannot tell.** There is no owner procedure here and there
		 * should not be one: being the owner is what a password opened rather than a bit on a row,
		 * so this asks only that somebody is signed in and that a password and an account were
		 * given. Whether the caller is the owner, whether the password opens their vault, and
		 * whether the account named has a password of its own are Rust's alone, exactly as
		 * `organization.delete` leaves them.
		 *
		 * The password crosses in and nothing about it crosses back ([[rules/credentials]],
		 * *Client boundary*). The floor is not applied: it is being checked against a vault rather
		 * than chosen, which is the reading `organization.delete` and `password.change` take of a
		 * current password.
		 */
		offerOwnership: procedure.member
			.input(z.object({ memberId: z.string().trim().min(1), password: z.string().min(1) }))
			.mutation(async ({ input, ctx }): Promise<OrganizationMember> => {
				return ctx.host.organization.member.offerOwnership(input.memberId, input.password);
			}),
		/**
		 * Take the offer back. The owner's on the same reading, and it takes nothing: nothing is
		 * unsealed and there is one standing offer or none, so naming which would be naming
		 * something this side would have to have read.
		 */
		withdrawOffer: procedure.member.mutation(async ({ ctx }): Promise<void> => {
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
	},
	/**
	 * The organization's roles (effort 838, requirements 3 and 4), which the organization section
	 * of the settings area lists and edits.
	 *
	 * **Reading them is any signed-in member's**, as the members list is: what the roles are is not
	 * a secret from the people who hold them. **Every write is `manageRoles`'s here and again in
	 * Rust**, where the rest of requirement 7 is decided on verified rows: the role ranks below the
	 * caller, a built-in role is not renamed, moved or deleted, and a mask carries only flags the
	 * caller holds and none of the owner's.
	 */
	role: {
		list: procedure.member.query(async ({ ctx }): Promise<OrganizationRole[]> => {
			return ctx.host.organization.roles();
		}),
		create: procedure
			.permitted('manageRoles')
			.input(z.object({ name: ROLE_NAME, mask: MASK, afterRoleId: ROLE_ID }))
			.mutation(async ({ input, ctx }): Promise<OrganizationRole> => {
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
	},
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
	},
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
	 * The organization's signature or seal (effort 835, requirement 13). `member` for all three:
	 * anybody signed in reads it for the pages they print, and whether they may change it is
	 * `manageMark`, which Rust reads off the verified row and signs under. A path rather than the
	 * image, because the host reads the file the
	 * dialog chose and checks it by its bytes.
	 */
	mark: {
		get: procedure.member.query(async ({ ctx }): Promise<OrganizationMark | null> => {
			return ctx.host.organization.markGet();
		}),
		set: procedure.member
			.input(z.object({ path: z.string().min(1) }))
			.mutation(async ({ input, ctx }): Promise<OrganizationMark> => {
				return ctx.host.organization.markSet(input.path);
			}),
		clear: procedure.member.mutation(async ({ ctx }): Promise<void> => {
			await ctx.host.organization.markClear();
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
