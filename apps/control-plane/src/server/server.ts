import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import { sql } from 'drizzle-orm';

import { signInWithGoogle } from '../account/account.ts';
import type { Database } from '../database/database.ts';
import { MALFORMED, Refusal, refusalBody, UNAUTHENTICATED, UNAVAILABLE } from '../failure.ts';
import {
	looksLikeSessionToken,
	resumeSession,
	startSession,
	type IssuedSession
} from '../session/session.ts';
import type { VerifyGoogleIdentity } from '../account/google.ts';
import type { Account, Workspace } from '../database/schema.ts';
import type { ConnectToWorkspaceDatabase } from '../workspace/migration.ts';
import type { TursoPlatform } from '../workspace/turso.ts';
import { mintWorkspaceToken, workspaceForAccount } from '../workspace/workspace.ts';

/**
 * The control plane's HTTP surface.
 *
 * **Plain JSON over HTTP, and the choice is the caller's rather than the repository's habit.**
 * The desktop's tRPC runs in-process inside the webview with no HTTP under it, so it is a
 * precedent for nothing here; the client that calls these routes is the Rust side, because
 * credentials never cross the IPC boundary. tRPC's whole return is end-to-end inference into a
 * TypeScript client, and the only known client is not one. *Rejected, so it is not re-proposed:
 * tRPC over HTTP for the sake of matching the desktop — it would buy a shape and cost the Rust
 * side a hand-written encoding of a wire format designed to be generated.*
 *
 * Everything ambient is an argument. The database, what verifies an identity, and the clock all
 * arrive here rather than being reached for, which is what lets the tests below run the real
 * routes against a real database and a fake Google.
 */
export type ControlPlane = {
	db: Database;
	verifyIdentity: VerifyGoogleIdentity;
	platform: TursoPlatform;
	/**
	 * how a hosted workspace's *own* database is opened, which the mint does when it has a
	 * migration to apply to one. Never the control plane's database, and never a replica.
	 */
	connectToWorkspace: ConnectToWorkspaceDatabase;
	now?: () => number;
};

const MAXIMUM_BODY_BYTES = 16 * 1024;

const json = (response: ServerResponse, status: number, body: unknown) => {
	response.writeHead(status, { 'content-type': 'application/json' });
	response.end(JSON.stringify(body));
};

/** an account as it goes over the wire — timestamps as epoch milliseconds, as the desktop reads them. */
const wireAccount = (record: Account) => ({
	id: record.id,
	email: record.email,
	displayName: record.displayName,
	avatarUrl: record.avatarUrl,
	googleUserId: record.googleUserId,
	createdAt: record.createdAt.getTime(),
	updatedAt: record.updatedAt.getTime()
});

/**
 * a workspace as it goes over the wire.
 *
 * The database's *name* stays here: it is what the Platform API calls it by, and a client that
 * holds it holds the one argument every administrative call to Turso takes. The hostname is
 * what a client actually needs, and it gets it as part of a mint rather than on its own.
 */
const wireWorkspace = (record: Workspace) => ({
	id: record.id,
	name: record.name,
	ownerAccountId: record.ownerAccountId,
	createdAt: record.createdAt.getTime(),
	updatedAt: record.updatedAt.getTime()
});

/**
 * Who is asking, and how much longer they may keep asking.
 *
 * **Two credentials arrive on the same header and the prefix tells them apart** (#550). A Google
 * access token is what somebody signs in with, and it buys a *session* — a token this control
 * plane issued, good for three days, and renewed by the very act of being presented. Every route
 * below therefore renews the session it was reached with, which is requirement 15's *any
 * connection inside the window renews it*, implemented once here rather than remembered at each
 * route.
 *
 * **The session is what replaces re-verifying with Google on every request**, which is what this
 * function did until #550: a round trip to Google per request, so that a client which had signed
 * in a minute ago proved it again. What it costs to stop is that a Google token revoked mid-window
 * is not noticed until the session runs out — which is the same bound *Architecture* already
 * accepts for removing somebody, and the reason it is three days and not thirty.
 *
 * A route reached with a Google token is still served: signing in *is* the identification, so a
 * client whose first request is not `/account/sign-in` reaches the account it would have reached.
 *
 * **It is given a session by such a route, and every route hands one back.** The link that used to
 * sit here pointed at an `askingForASession` that was never written, and the behaviour it was
 * meant to describe was never built either: a request carrying a Google access token starts a
 * session, so a client that keeps presenting one writes a row per request. The desktop presents
 * `rws_` after its first request and is the only client, which is what bounds the accrual, and
 * the spec records that as an assumption rather than as something enforced here. Requirement 19
 * answers what accumulates by pruning it (`../prune.ts`); making this route reuse a live session
 * instead was put to the human and declined as scope.
 */
const asking = async (
	plane: ControlPlane,
	request: IncomingMessage
): Promise<{ account: Account; session: IssuedSession }> => {
	const header = request.headers.authorization ?? '';
	const [scheme, ...rest] = header.split(' ');
	const token = rest.join(' ').trim();

	if (scheme?.toLowerCase() !== 'bearer' || token === '') {
		throw new Refusal(UNAUTHENTICATED, 401, 'sign in with google before asking for this');
	}

	const now = (plane.now ?? Date.now)();

	if (looksLikeSessionToken(token)) {
		return await resumeSession(plane.db, token, now);
	}

	const identity = await plane.verifyIdentity(token);
	const account = await signInWithGoogle(plane.db, identity, now);

	// **Here rather than in the sign-in route, because this is where an account comes into being.**
	// Any route reached with a Google token creates the account, so provisioning only in `identify`
	// left a window in which an account existed with no workspace — requirement 6 is *exactly one*
	// and that window makes it *at most one*. It is idempotent, so every later request is one
	// indexed read and no Turso call.
	await workspaceForAccount(plane.db, plane.platform, {
		accountId: account.id,
		name: account.displayName,
		now
	});

	return { account, session: await startSession(plane.db, account.id, now) };
};

const readJsonBody = async (request: IncomingMessage): Promise<Record<string, unknown>> => {
	const chunks: Buffer[] = [];
	let size = 0;

	for await (const chunk of request) {
		size += chunk.length;

		// A sign-in body is one token. Reading an unbounded stream into memory because a caller
		// said it was JSON is a way to be taken down by one request.
		if (size > MAXIMUM_BODY_BYTES) {
			throw new Refusal(MALFORMED, 413, 'that request is too large to be a sign-in');
		}

		chunks.push(Buffer.from(chunk));
	}

	if (size === 0) {
		return {};
	}

	try {
		const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
		return parsed !== null && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
	} catch {
		throw new Refusal(MALFORMED, 400, 'that request body is not json');
	}
};

/**
 * a session as it goes over the wire.
 *
 * **Both of the session's moments ride with the token, and they are not the same kind of thing.**
 * `expiresAt` is the refresh window: how much longer this client may work without reaching here,
 * which it obeys by locking itself, and which a reach moves. `absoluteExpiresAt` is when the
 * sign-in stops being renewable at all — enforced here, whatever the client believes, which is
 * why the client is given the number rather than trusted to keep one.
 */
const wireSession = (issued: IssuedSession) => ({
	token: issued.token,
	expiresAt: issued.expiresAt,
	absoluteExpiresAt: issued.absoluteExpiresAt
});

/**
 * Say who this is, and hand back a session to go on with.
 *
 * **Two routes, one handler, and they are not collapsed into one route.** `POST
 * /account/sign-in` is where a Google token is exchanged for a session; `POST /session/refresh`
 * is where a session is renewed on its own. They behave identically because `asking` already
 * accepts either credential — but a client calls them for different reasons, and a refusal from
 * the second means *the window closed* where the same refusal from the first would mean *Google
 * said no*. Forcing a difference in the bodies to justify two names would be inventing one.
 *
 * The refresh exists for the client that is doing nothing else: open, in sync, and with a window
 * quietly running down, which would otherwise have to invent a reason to call something in order
 * to stay signed in. Every other route renews the session it was reached with anyway, so a client
 * that is doing anything at all never needs it.
 *
 * The refusal is `resumeSession`'s and it names the action to take: past the window there is
 * nothing left to renew, and signing in with Google is the only way back.
 */
const identify = async (
	plane: ControlPlane,
	request: IncomingMessage,
	response: ServerResponse
) => {
	const { account, session } = await asking(plane, request);

	// **The workspace comes back with the identity** — requirement 3's *in the same act*. `asking`
	// has already provisioned it for an account that was just created, so this is a read; it stays
	// a `workspaceForAccount` rather than a bare lookup so that a session resumed against an
	// account from before this change still gets one.
	const workspace = await workspaceForAccount(plane.db, plane.platform, {
		accountId: account.id,
		name: account.displayName,
		now: (plane.now ?? Date.now)()
	});

	json(response, 200, {
		account: wireAccount(account),
		workspace: wireWorkspace(workspace),
		session: wireSession(session)
	});
};

/**
 * What the client was built against, off its request.
 *
 * **It is required rather than defaulted**, and a default is the thing to resist here: any number
 * chosen for a client that did not say is a guess about which schema it understands, and the
 * whole of decision 06 is that guessing is what diverges a replica. A caller that omits it is a
 * caller with a defect, and it is told so.
 *
 * **The floor is one, not zero, and zero is the value that would have been dangerous.** A
 * workspace is created at `0` with an empty database, so a mint at `0` is the *equal* case: it
 * would issue a full-access token for a database with no tables in it, and a client holding that
 * would have nothing to sync and every reason to build the schema itself — which is decision 06's
 * rejected option B, arriving through the one door left open. No real client can send it either:
 * the desktop derives its version by counting migrations and there has never been a release with
 * none. So the first mint on a workspace always migrates, and a database a token exists for
 * always has a schema.
 */
const schemaVersionIn = (body: Record<string, unknown>): number => {
	const version = body.schemaVersion;

	if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
		throw new Refusal(
			MALFORMED,
			400,
			'say which schema version this application was built against'
		);
	}

	return version;
};

const mint = async (
	plane: ControlPlane,
	request: IncomingMessage,
	response: ServerResponse,
	workspaceId: string
) => {
	const { account, session } = await asking(plane, request);
	const schemaVersion = schemaVersionIn(await readJsonBody(request));

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
	// workspace does not renew through it — and why the client keeps both numbers and believes
	// the earlier.
	json(response, 200, { ...minted, session: wireSession(session) });
};

const health = async (plane: ControlPlane, response: ServerResponse) => {
	try {
		// The query is the point of the route: a process that answers without having reached its
		// database reports the one thing a health check exists to disprove.
		await plane.db.get(sql`select 1`);
	} catch {
		// 503 rather than the generic 500, because *unavailable* is the answer this route exists to
		// give and a checker keyed on the status should not have to parse a body to find out. The
		// reason stays here: it names a file or a hostname, and this route needs no credential.
		throw new Refusal(UNAVAILABLE, 503, 'the control plane cannot reach its database');
	}

	// Whether the database answered, and not which one it is. The URL is on stdout at startup,
	// where the person running it can see it and a caller cannot.
	json(response, 200, { status: 'ok' });
};

export const controlPlaneServer = (plane: ControlPlane): Server =>
	createServer((request, response) => {
		const route = async () => {
			if (request.method === 'GET' && request.url === '/health') {
				return health(plane, response);
			}

			if (
				request.method === 'POST' &&
				(request.url === '/account/sign-in' || request.url === '/session/refresh')
			) {
				return identify(plane, request, response);
			}

			// **There is no route that creates a workspace**, and that is requirement 6 rather than an
			// omission: an account is given its one workspace when it is created, so a creation
			// route could only ever refuse. Requirement 14's organization work is what reopens it,
			// when an account may have several and something has to say which.

			// Not decoded: a workspace id is a UUID, so there is nothing to unescape, and
			// `decodeURIComponent` throws on a malformed escape — which would turn a nonsense path
			// into a 500 where it should be a 404.
			const minting = /^\/workspace\/([^/]+)\/token$/.exec(request.url ?? '');

			if (request.method === 'POST' && minting?.[1]) {
				return mint(plane, request, response, minting[1]);
			}

			json(response, 404, { error: { code: 'no_such_route', message: 'there is nothing here' } });
		};

		route().catch((error: unknown) => {
			if (error instanceof Refusal) {
				json(response, error.status, refusalBody(error));
				return;
			}

			// Nothing about an unexpected failure goes to the caller. It is this process's defect,
			// and its text is the sort of thing that names a table or a path.
			console.error('control plane failed to answer', error);
			json(response, 500, {
				error: { code: UNAVAILABLE, message: 'something went wrong here. try again' }
			});
		});
	});
