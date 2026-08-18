import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import { sql } from 'drizzle-orm';

import { signInWithGoogle } from './account.ts';
import type { Database } from './database.ts';
import { MALFORMED, Refusal, refusalBody, UNAVAILABLE } from './failure.ts';
import type { VerifyGoogleIdentity } from './google.ts';
import type { Account } from './schema.ts';

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
	now?: () => number;
};

const MAXIMUM_BODY_BYTES = 16 * 1024;

const json = (response: ServerResponse, status: number, body: unknown) => {
	response.writeHead(status, { 'content-type': 'application/json' });
	response.end(JSON.stringify(body));
};

/** an account as it goes over the wire — timestamps as epoch milliseconds, as the desktop reads them. */
const wire = (record: Account) => ({
	id: record.id,
	email: record.email,
	displayName: record.displayName,
	avatarUrl: record.avatarUrl,
	googleUserId: record.googleUserId,
	createdAt: record.createdAt.getTime(),
	updatedAt: record.updatedAt.getTime()
});

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
	const body = await readJsonBody(request);
	const accessToken = typeof body.accessToken === 'string' ? body.accessToken.trim() : '';

	if (accessToken === '') {
		throw new Refusal(MALFORMED, 400, 'a sign-in needs a google access token');
	}

	const identity = await plane.verifyIdentity(accessToken);
	const record = await signInWithGoogle(plane.db, identity, (plane.now ?? Date.now)());

	json(response, 200, { account: wire(record) });
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
