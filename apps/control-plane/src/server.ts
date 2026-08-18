import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import { sql } from 'drizzle-orm';

import { signInWithGoogle } from './account.ts';
import type { Database } from './database.ts';
import { MALFORMED, Refusal, refusalBody, UNAUTHENTICATED, UNAVAILABLE } from './failure.ts';
import type { VerifyGoogleIdentity } from './google.ts';
import type { Account, Workspace } from './schema.ts';
import type { TursoPlatform } from './turso.ts';
import { createWorkspace, mintWorkspaceToken } from './workspace.ts';

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
 * Who is asking.
 *
 * **The Google access token is the credential on every route that acts as somebody**, presented
 * the way a credential conventionally is. There is no session token yet — one is #550's, and
 * this is the thing it replaces — so identity is re-established from Google on each request. It
 * costs one round trip and it is honest: *Architecture* has the API in the credential path
 * continuously, and this is what that sentence buys.
 */
const asking = async (plane: ControlPlane, request: IncomingMessage): Promise<Account> => {
	const header = request.headers.authorization ?? '';
	const [scheme, ...rest] = header.split(' ');
	const token = rest.join(' ').trim();

	if (scheme?.toLowerCase() !== 'bearer' || token === '') {
		throw new Refusal(UNAUTHENTICATED, 401, 'sign in with google before asking for this');
	}

	const identity = await plane.verifyIdentity(token);

	// Signing in *is* the identification, so every route performs it rather than looking an
	// account up: a person whose first request is not `/account/sign-in` still reaches the account
	// they would have reached, and their profile is as fresh on one route as on another.
	return signInWithGoogle(plane.db, identity, (plane.now ?? Date.now)());
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

const signIn = async (plane: ControlPlane, request: IncomingMessage, response: ServerResponse) => {
	json(response, 200, { account: wireAccount(await asking(plane, request)) });
};

const makeWorkspace = async (
	plane: ControlPlane,
	request: IncomingMessage,
	response: ServerResponse
) => {
	const account = await asking(plane, request);
	const body = await readJsonBody(request);
	const name = typeof body.name === 'string' ? body.name.trim() : '';

	if (name === '') {
		throw new Refusal(MALFORMED, 400, 'a workspace needs a name');
	}

	const created = await createWorkspace(plane.db, plane.platform, {
		accountId: account.id,
		name,
		now: (plane.now ?? Date.now)()
	});

	json(response, 201, { workspace: wireWorkspace(created) });
};

const mint = async (
	plane: ControlPlane,
	request: IncomingMessage,
	response: ServerResponse,
	workspaceId: string
) => {
	const account = await asking(plane, request);

	const minted = await mintWorkspaceToken(plane.db, plane.platform, {
		workspaceId,
		accountId: account.id,
		now: (plane.now ?? Date.now)()
	});

	json(response, 200, minted);
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

			if (request.method === 'POST' && request.url === '/account/sign-in') {
				return signIn(plane, request, response);
			}

			if (request.method === 'POST' && request.url === '/workspace') {
				return makeWorkspace(plane, request, response);
			}

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
