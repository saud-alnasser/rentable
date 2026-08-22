import type { RouteHandlerMethod } from 'fastify';

import { membershipOf, workspaceForAccount } from '../workspace/workspace.ts';
import { askingOf } from './authenticate.ts';
import type { ControlPlane } from './server.ts';
import { wireAccount, wireSession, wireWorkspace } from './wire.ts';

/**
 * Say who this is, and hand back a session to go on with.
 *
 * **Two routes, one handler, and they are not collapsed into one route.** `POST
 * /account/sign-in` is where a Google token is exchanged for a session; `POST /session/refresh`
 * is where a session is renewed on its own. They behave identically because the authenticate hook
 * already accepts either credential. But a client calls them for different reasons, and a refusal
 * from the second means *the window closed* where the same refusal from the first would mean
 * *Google said no*. Forcing a difference in the bodies to justify two names would be inventing one.
 *
 * The refresh exists for the client that is doing nothing else: open, in sync, and with a window
 * quietly running down, which would otherwise have to invent a reason to call something in order
 * to stay signed in. Every other route renews the session it was reached with anyway, so a client
 * that is doing anything at all never needs it.
 *
 * The refusal is `resumeSession`'s and it names the action to take: past the window there is
 * nothing left to renew, and signing in with Google is the only way back.
 */
export const identify =
	(plane: ControlPlane): RouteHandlerMethod =>
	async (request) => {
		const { account, session } = askingOf(request);

		// **The workspace comes back with the identity**, which is requirement 3's *in the same act*. The
		// hook has already provisioned it for an account that was just created, so this is a read;
		// it stays a `workspaceForAccount` rather than a bare lookup so that a session resumed
		// against an account from before this change still gets one.
		const workspace = await workspaceForAccount(plane.db, plane.platform, {
			accountId: account.id,
			name: account.displayName,
			now: (plane.now ?? Date.now)()
		});

		// **What the asking account may do in it, and nobody else's row.** `membershipOf` reads by
		// workspace *and* account, so there is no shape here that could answer with somebody else's
		// permissions. This is not a members listing and does not become one.
		//
		// **A row that is not there answers zero rather than refusing.** This is the sign-in route,
		// and throwing here would lock somebody out of the application over a row `createWorkspace`
		// writes inside the same transaction as the workspace itself. Zero is the literal rather
		// than `ADMINISTRATION_BY_ROLE.member`, which carries the same number today: what is being
		// said here is *no row*, not *the member default*, and the day that default stops being zero
		// those two stop meaning the same thing.
		const belongs = await membershipOf(plane.db, workspace.id, account.id);

		return {
			account: wireAccount(account),
			workspace: wireWorkspace(workspace, belongs?.permissions ?? 0),
			session: wireSession(session)
		};
	};
