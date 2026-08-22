import type { FastifyRequest, RouteHandlerMethod } from 'fastify';

import { mintWorkspaceToken, renameWorkspace } from '../workspace/workspace.ts';
import { askingOf } from './authenticate.ts';
import type { ControlPlane } from './server.ts';
import { wireSession, wireWorkspace } from './wire.ts';

/** the workspace a route was reached for, off its path. */
type ForWorkspace = FastifyRequest<{ Params: { workspaceId: string } }>;

/**
 * A token for the workspace's own database, and the migration that has to happen first.
 *
 * **There is no route that creates a workspace**, and that is requirement 6 rather than an
 * omission: an account is given its one workspace when it is created, so a creation route could
 * only ever refuse. Requirement 14's organization work is what reopens it, when an account may
 * have several and something has to say which.
 */
export const mint =
	(plane: ControlPlane): RouteHandlerMethod =>
	async (request) => {
		const { account, session } = askingOf(request);
		const { workspaceId } = (request as ForWorkspace).params;
		const { schemaVersion } = (request as FastifyRequest<{ Body: { schemaVersion: number } }>).body;

		const minted = await mintWorkspaceToken(plane.db, plane.platform, plane.connectToWorkspace, {
			workspaceId,
			accountId: account.id,
			schemaVersion,
			now: (plane.now ?? Date.now)()
		});

		// **Both windows, in one answer, and that is the whole of why the mint is the renewal a
		// client uses.** `expiresAt` is the Turso credential the replica actually syncs with;
		// `session.expiresAt` is how much longer this control plane will hand out another. Reached
		// here they restart together, so a client that renews by minting has one clock rather than
		// two that drift. `/session/refresh` moves only the second, which is why a client holding a
		// workspace does not renew through it, and why the client keeps both numbers and believes
		// the earlier.
		return { ...minted, session: wireSession(session) };
	};

/**
 * Rename a workspace.
 *
 * **The answer carries the whole workspace rather than the name that was sent**, which is what
 * makes it the same shape as the identifying routes: what a client shows is what this control
 * plane holds, and the name it stored is trimmed, so echoing the request back would be the one
 * case where the two differ.
 */
export const rename =
	(plane: ControlPlane): RouteHandlerMethod =>
	async (request) => {
		const { account, session } = askingOf(request);
		const { workspaceId } = (request as ForWorkspace).params;
		const { name } = (request as FastifyRequest<{ Body: { name: string } }>).body;

		const renamed = await renameWorkspace(plane.db, {
			workspaceId,
			accountId: account.id,
			name,
			now: (plane.now ?? Date.now)()
		});

		return {
			workspace: wireWorkspace(renamed.workspace, renamed.permissions),
			session: wireSession(session)
		};
	};
