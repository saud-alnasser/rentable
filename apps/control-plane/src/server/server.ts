import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';

import type { Database } from '../database/database.ts';
import { MALFORMED, Refusal, refusalBody, UNAVAILABLE } from '../failure.ts';
import type { VerifyGoogleIdentity } from '../account/google.ts';
import type { ConnectToWorkspaceDatabase } from '../workspace/migration.ts';
import type { TursoPlatform } from '../workspace/turso.ts';
import { routes } from './routes.ts';
import { messageForValidation } from './schema.ts';

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
 * arrive here rather than being reached for, which is what lets the tests run the real routes
 * against a real database and a fake Google.
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

/** what a framework failure is called, where the framework names it rather than throwing a `Refusal`. */
const codeOf = (error: unknown): string =>
	typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';

/** the validation issues a schema failure carries, or nothing if this is not one. */
const validationOf = (error: unknown): readonly Record<string, unknown>[] | undefined =>
	typeof error === 'object' && error !== null && 'validation' in error
		? (error.validation as readonly Record<string, unknown>[])
		: undefined;

/**
 * The control plane, built and not yet listening.
 *
 * **`plane` is the first argument and stays the only one that matters**: `main.ts` and
 * `tests/testing.ts` both hold a `ControlPlane` and want something they can start, and neither
 * should care which framework is underneath. What did change is how it is started: a Fastify
 * instance takes `listen({ port })` where `node:http` took `listen(port)`, and that is the only
 * change acceptance criterion 4 permits in the tests.
 *
 * **`logger` is second and optional because a test has to be able to read what was logged.** It is
 * Fastify's own option, passed through: `true` in production, and a test passes a stream so it can
 * assert on the lines rather than on the fact that a call was made. A logger reached for instead of
 * passed in could not be asserted on at all, and would be the first ambient dependency in this
 * package.
 */
export const controlPlaneServer = (
	plane: ControlPlane,
	{ logger = true }: { logger?: FastifyServerOptions['logger'] } = {}
): FastifyInstance => {
	const app = Fastify({
		bodyLimit: MAXIMUM_BODY_BYTES,
		logger,
		/**
		 * **Type coercion off, and it is not a preference.** Fastify configures AJV with
		 * `coerceTypes` on, so `{"name": 7}` is quietly turned into `{"name": "7"}` and stored as the
		 * string `7`. `workspaceNameIn` refused it, and `server.test.ts` asserts that refusal, which
		 * is how this was caught rather than shipped: the suite went 39 of 40 with a 200 where a 400
		 * belonged.
		 *
		 * The general form is worse than the one case. A declaration that coerces is a declaration
		 * that describes what the caller *may be read as* rather than what it *may send*, which is
		 * the opposite of the property this whole effort is for. Nothing here needs it: the only
		 * route parameter is already a string, and the only numeric field arrives from a client that
		 * writes it as a bare JSON number.
		 */
		ajv: { customOptions: { coerceTypes: false } }
	});

	/**
	 * An empty body is `{}`, not a refusal.
	 *
	 * `readJsonBody` returned `{}` for a request with nothing in it, and Fastify answers
	 * `FST_ERR_CTP_EMPTY_JSON_BODY` instead. That is a wire change nobody asked for, and it is not
	 * hypothetical: the sign-in and refresh routes are called with no body and the test helper
	 * always sends `content-type: application/json`, so every one of those tests would fail.
	 *
	 * The rest of the parse is Fastify's own `JSON.parse`, so a body that is not json still fails
	 * here and is mapped below.
	 */
	app.addContentTypeParser(
		'application/json',
		{ parseAs: 'string' },
		(_request, body: string, done) => {
			if (body === '') {
				done(null, {});
				return;
			}

			try {
				done(null, JSON.parse(body));
			} catch {
				done(new Refusal(MALFORMED, 400, 'that request body is not json'), undefined);
			}
		}
	);

	/**
	 * The one place a failure becomes a response.
	 *
	 * Before this, every route's failure went through one `catch` at the foot of the dispatcher,
	 * which was the same idea reached by a different route. What is new is that the framework's own
	 * failures arrive here too, and they arrive in the framework's vocabulary rather than in
	 * `failure.ts`'s, so this is also where that vocabulary stops.
	 */
	app.setErrorHandler((error, request, reply) => {
		if (error instanceof Refusal) {
			return reply.status(error.status).send(refusalBody(error));
		}

		const issues = validationOf(error);

		if (issues) {
			const refusal = new Refusal(MALFORMED, 400, messageForValidation(issues));

			return reply.status(refusal.status).send(refusalBody(refusal));
		}

		// The body limit was `readJsonBody`'s and is now the instance's, so the refusal that used to
		// be raised while reading has to be rebuilt from what the framework raised instead. A sign-in
		// body is one token; reading an unbounded stream into memory because a caller said it was
		// JSON is a way to be taken down by one request.
		if (codeOf(error) === 'FST_ERR_CTP_BODY_TOO_LARGE') {
			const refusal = new Refusal(MALFORMED, 413, 'that request is too large to be a sign-in');

			return reply.status(refusal.status).send(refusalBody(refusal));
		}

		// Nothing about an unexpected failure goes to the caller. It is this process's defect,
		// and its text is the sort of thing that names a table or a path.
		//
		// **`request.log` rather than the instance's**, which is the whole of requirement 6 in one
		// line: it carries the `reqId` Fastify stamped on this request, so this line can be tied to
		// the request that caused it and told apart from another failing at the same moment. The
		// instance's logger would write the same words with nothing joining them to anything.
		request.log.error({ err: error }, 'control plane failed to answer');

		return reply
			.status(500)
			.send({ error: { code: UNAVAILABLE, message: 'something went wrong here. try again' } });
	});

	// Fastify's own 404 carries its own shape, and this one is a contract like any other.
	app.setNotFoundHandler((_request, reply) =>
		reply.status(404).send({ error: { code: 'no_such_route', message: 'there is nothing here' } })
	);

	routes(app, plane);

	return app;
};
