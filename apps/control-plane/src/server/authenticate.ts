import type { FastifyRequest, onRequestAsyncHookHandler } from 'fastify';

import { signInWithGoogle } from '../account/account.ts';
import { Refusal, UNAUTHENTICATED } from '../failure.ts';
import {
	looksLikeSessionToken,
	resumeSession,
	startSession,
	type IssuedSession
} from '../session/session.ts';
import type { Account } from '../database/schema.ts';
import { workspaceForAccount } from '../workspace/workspace.ts';
import type { ControlPlane } from './server.ts';

/** who reached a route, and the session they carry on with. */
export type Asking = { account: Account; session: IssuedSession };

declare module 'fastify' {
	interface FastifyRequest {
		/**
		 * set by {@link authenticate}, and only on the routes that declare it.
		 *
		 * **State on the request, never on the instance.** It is per request and it is gone when
		 * the request is, which is what keeps requirement 7 true: nothing here is reachable from a
		 * handler that was not given it.
		 */
		asking?: Asking;
	}
}

/**
 * Who is asking, and how much longer they may keep asking.
 *
 * **Two credentials arrive on the same header and the prefix tells them apart** (#550). A Google
 * access token is what somebody signs in with, and it buys a *session*: a token this control
 * plane issued, good for three days, and renewed by the very act of being presented. Every route
 * that declares this hook therefore renews the session it was reached with, which is requirement
 * 15's *any connection inside the window renews it*, implemented once here rather than remembered
 * at each route.
 *
 * **The session is what replaces re-verifying with Google on every request**, which is what this
 * did until #550: a round trip to Google per request, so that a client which had signed in a
 * minute ago proved it again. What it costs to stop is that a Google token revoked mid-window is
 * not noticed until the session runs out, which is the same bound *Architecture* already accepts
 * for removing somebody, and the reason it is three days and not thirty.
 *
 * A route reached with a Google token is still served: signing in *is* the identification, so a
 * client whose first request is not `/account/sign-in` reaches the account it would have reached.
 *
 * **It is given a session by such a route, and every route hands one back.** A request carrying a
 * Google access token starts a session, so a client that keeps presenting one writes a row per
 * request. The desktop presents `rws_` after its first request and is the only client, which is
 * what bounds the accrual, and the spec records that as an assumption rather than as something
 * enforced here. Requirement 19 answers what accumulates by pruning it (`../prune.ts`); making
 * this reuse a live session instead was put to the human and declined as scope.
 *
 * ## Why this is `onRequest` and not `preValidation`
 *
 * **Fastify parses the body before `preValidation` runs**, so a request carrying no credential and
 * a body that is not JSON would be answered 400 by the parser before authentication was ever
 * consulted. Measured on 2026-08-22: `preValidation` answers 400 there and `onRequest` answers
 * 401, and 401 is what `server.ts` answered before this change, because `asking` was called and
 * only then was the body read. `preHandler` is wrong for the same reason and worse, running after
 * validation as well.
 *
 * The name is the trap. `preValidation` reads as *before anything looks at the body*, and it is
 * before *validation* only.
 *
 * ## Why it is attached per route
 *
 * Registered on the instance instead, it would run for every route including `/health`, which
 * takes no credential and must not start demanding one. Measured the same day, by writing it the
 * obvious way and watching a 404 come back 401.
 */
export const authenticate =
	(plane: ControlPlane): onRequestAsyncHookHandler =>
	async (request) => {
		const header = request.headers.authorization ?? '';
		const [scheme, ...rest] = header.split(' ');
		const token = rest.join(' ').trim();

		if (scheme?.toLowerCase() !== 'bearer' || token === '') {
			throw new Refusal(UNAUTHENTICATED, 401, 'sign in with google before asking for this');
		}

		const now = (plane.now ?? Date.now)();

		if (looksLikeSessionToken(token)) {
			request.asking = await resumeSession(plane.db, token, now);
			return;
		}

		const identity = await plane.verifyIdentity(token);
		const account = await signInWithGoogle(plane.db, identity, now);

		// **Here rather than in the sign-in route, because this is where an account comes into
		// being.** Any route reached with a Google token creates the account, so provisioning only
		// in `identify` left a window in which an account existed with no workspace, and requirement 6
		// is *exactly one* and that window makes it *at most one*. It is idempotent, so every later
		// request is one indexed read and no Turso call.
		await workspaceForAccount(plane.db, plane.platform, {
			accountId: account.id,
			name: account.displayName,
			now
		});

		request.asking = { account, session: await startSession(plane.db, account.id, now) };
	};

/**
 * What {@link authenticate} left on the request.
 *
 * Throwing here is not a refusal and is not shaped like one: it means a route was declared with a
 * handler that reads a credential and without the hook that establishes one, which is a defect in
 * this repository rather than in the caller. It reaches the error handler as an unexpected failure
 * and the caller is told nothing, which is the correct answer to somebody else's bug.
 */
export const askingOf = (request: FastifyRequest): Asking => {
	if (!request.asking) {
		throw new Error('a route read the asking account without declaring the authenticate hook');
	}

	return request.asking;
};
