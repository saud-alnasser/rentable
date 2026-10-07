import type { OrganizationMark, OrganizationState } from '$lib/organization/host';
import { procedure, router } from '$lib/api/trpc';
import z from 'zod';

import member from './member/router';
import { ORGANIZATION_NAME_LIMIT } from './setup/setup';
import role from './role/router';
import session from './session/router';
import setup from './setup/router';
import upgrade from './upgrade/router';
import workspace from './workspace/router';

/**
 * ORGANIZATION ROUTER
 *
 * an organization on a Turso account the customer owns, mounted at the root at `organization`.
 *
 * **The consent and the first run are `public`**, for the same reason the sync router's state read
 * is: they are how a person comes to have an identity in an organization at all, so a procedure
 * that required one would be answerable only after the thing it exists to do. **Every procedure
 * after them is a member's own act or names the flag its Rust command checks** (effort 838).
 * Each reaches `ctx.host` and never `ctx.db`, which is the test for `public` [[rules/api-layer]]
 * states. *It was `public`, all of it, until the organization's acts were given their callers.*
 *
 * **What crosses is outcomes.** The consent yields an address to open and a status to poll; the
 * first run yields an id and a link. The token, the keys and the password stay on the other side
 * of the boundary ([[rules/credentials]], *Client boundary*).
 *
 * **Each sub-concept holds its own procedures** (`./setup`, `./workspace`, `./member`, `./role`,
 * `./session`, `./upgrade`), and this router mounts them where they always stood: the way in's and
 * the reader's own at the root, the rest under their names. What belongs to the organization as a
 * whole, letting it go, handing it over and its mark, is written here.
 */
export default router({
	...setup,
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
	 * Choose the organization the wall opens on (effort 851, requirement 3).
	 *
	 * **`public`, because it happens at the wall**, where nobody is signed in; Rust refuses it
	 * while somebody is, since switching happens signed out. It does not reach `ctx.db`.
	 */
	select: procedure.public
		.input(z.object({ organizationId: z.string().min(1) }))
		.mutation(async ({ input, ctx }): Promise<OrganizationState> => {
			return ctx.host.organization.select(input.organizationId);
		}),
	/**
	 * Forget one organization this machine holds, and nothing else (effort 851, requirement 5).
	 *
	 * **`public` for the reason the disconnect is**: it is offered on the wall, and the host signs
	 * out first where the organization removed is the open one. It does not reach `ctx.db`. The
	 * one confirm before it is the screen's.
	 */
	remove: procedure.public
		.input(z.object({ organizationId: z.string().min(1) }))
		.mutation(async ({ input, ctx }): Promise<OrganizationState> => {
			return ctx.host.organization.remove(input.organizationId);
		}),
	/**
	 * Rename the organization (effort 851, requirements 22 to 28).
	 *
	 * **`member`, because the check is Rust's alone**: the rename is the owner's by role, and no
	 * flag says so, since the owner's role always carries everything and a `renameOrganization`
	 * flag would be one no role or override could be given. Rust asks the acting member's
	 * verified row for the owner's role and refuses anybody else with `ownerOnly`, whatever this
	 * side drew. The name is held to the walk's rules here as it is in Rust, trimmed and between
	 * one character and `ORGANIZATION_NAME_LIMIT`. What comes back is the whole state, so every
	 * screen reading the name reads the new one.
	 */
	rename: procedure.member
		.input(z.object({ name: z.string().trim().min(1).max(ORGANIZATION_NAME_LIMIT) }))
		.mutation(async ({ input, ctx }): Promise<OrganizationState> => {
			return ctx.host.organization.rename(input.name);
		}),
	/**
	 * Accept the organization that was offered to this reader: the second of the two acts a
	 * handover is (effort 828, requirement 22).
	 *
	 * **`member`, because it is the reader's own act**: the offer was made to them, and no flag
	 * is asked for accepting it, here or in Rust. Every judgement is Rust's. Whether an offer
	 * stands for this reader, whether the password opens their vault, and whether what was sealed
	 * onto their row is the key this machine holds are all answered where the keys are. What this
	 * side can say is that somebody is signed in and that a password was typed.
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
	 * **`deleteOrganization`, the flag `organization_delete` asks of the owner's verified row.**
	 * It is one of the owner's flags, which no role and no override carries, because it needs the
	 * platform authority only the owner's machine holds; this is the earlier refusal, and Rust's
	 * is the one that decides. Whether the password opens the owner's vault is Rust's alone, and
	 * the password crosses in and nothing about it crosses back ([[rules/credentials]], *Client
	 * boundary*). *It was `member` until ticket 17 of effort 838, when the package had no act for
	 * it.*
	 *
	 * The floor is not applied here. The password is being checked against a vault rather than
	 * chosen, and an organization sealed before the floor moved would be undeletable by its own
	 * owner if this refused it, which is the same reading `password.change` takes of the current
	 * password.
	 */
	delete: procedure
		.permitted('deleteOrganization')
		.input(z.object({ password: z.string().min(1) }))
		.mutation(async ({ input, ctx }): Promise<OrganizationState> => {
			return ctx.host.organization.delete(input.password);
		}),
	workspace,
	member,
	role,
	upgrade,
	...session,
	/**
	 * The organization's signature or seal (effort 835, requirement 13). Reading it is `member`:
	 * anybody signed in reads it for the pages they print. Setting and clearing it are
	 * `manageMark`, here and again in Rust, which reads it off the verified row and signs under it.
	 * A path rather than the image, because the host reads the file the dialog chose and checks it
	 * by its bytes.
	 */
	mark: {
		get: procedure.member.query(async ({ ctx }): Promise<OrganizationMark | null> => {
			return ctx.host.organization.markGet();
		}),
		set: procedure
			.permitted('manageMark')
			.input(z.object({ path: z.string().min(1) }))
			.mutation(async ({ input, ctx }): Promise<OrganizationMark> => {
				return ctx.host.organization.markSet(input.path);
			}),
		clear: procedure.permitted('manageMark').mutation(async ({ ctx }): Promise<void> => {
			await ctx.host.organization.markClear();
		})
	}
});
