import type { OrganizationMark, OrganizationState } from '$lib/organization/host';
import { procedure, router } from '$lib/api/trpc';
import z from 'zod';

import member from './member/router';
import role from './role/router';
import session from './session/router';
import setup from './setup/router';
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
 * `./session`), and this router mounts them where they always stood: the way in's and the reader's
 * own at the root, the rest under their names. What belongs to the organization as a whole, letting
 * it go, handing it over and its mark, is written here.
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
