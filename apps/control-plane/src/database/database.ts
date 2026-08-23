import { Buffer } from 'node:buffer';

import { createClient, type Client } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';

import * as schema from './schema.ts';

/**
 * Where the control plane's own database is, decided once and from the environment alone.
 *
 * A `file:` URL locally and a `libsql://` one for the hosted database, through the same client,
 * which is why libSQL is here rather than the `better-sqlite3` the desktop tests run on.
 *
 * **A configuration that cannot work is refused before anything opens.** Until #755 an unset
 * `CONTROL_PLANE_DATABASE_URL` fell back to `file:./control-plane.db`, so a process meant for the
 * hosted database quietly built a stray file beside itself and served from it; a hosted URL with
 * no token started, listened, and answered `/health` with a 503 naming no cause. Those are the two
 * failures {@link resolveDatabase} exists to turn into a sentence somebody can act on.
 */
export type DatabaseConfiguration =
	{ kind: 'local'; url: string } | { kind: 'hosted'; url: string; authToken: string };

/** a configuration, or the sentence to print before exiting. */
export type Resolution = { configured: DatabaseConfiguration } | { refusal: string };

/**
 * What the environment says, read as a value rather than as an effect.
 *
 * **It takes its environment rather than reaching for `process.env`**, so a test cannot
 * accidentally read the machine's own and a caller cannot forget which one it meant.
 * {@link connectOrExit} is the only place a *process* reads the real one. `../../drizzle.config.ts`
 * is the one other caller, and it reads it for a command rather than for a server, which is why it
 * throws the refusal instead of exiting.
 *
 * **The scheme decides.** `file:` is local and needs nothing else; every other scheme is a hosted
 * database and refuses without a token. Exempting `http:` for a local sqld was considered and
 * rejected: a typo that downgrades a real hosted URL to `http:` would then be accepted in silence,
 * and nothing in this repository runs one. The condition that reopens it is the first person who
 * wants `turso dev`.
 *
 * Both values are trimmed before they are judged, which is what makes a whitespace-only token a
 * refusal rather than a token. `required()` in `../main.ts` already trims for the same reason.
 */
export const resolveDatabase = (env: NodeJS.ProcessEnv): Resolution => {
	const url = env.CONTROL_PLANE_DATABASE_URL?.trim() ?? '';
	const authToken = env.CONTROL_PLANE_DATABASE_TOKEN?.trim() ?? '';

	if (url === '') {
		return {
			refusal:
				'CONTROL_PLANE_DATABASE_URL is not set. See .env.example, the control plane has no ' +
				'database to open without it.'
		};
	}

	let parsed;

	try {
		parsed = new URL(url);
	} catch {
		// The value is not echoed. `ERR_INVALID_URL` says only "Invalid URL", which names neither
		// the variable nor the fix, and a mistyped URL is exactly where a token gets pasted.
		return {
			refusal:
				'CONTROL_PLANE_DATABASE_URL is not a URL. It needs a scheme: file:./control-plane.db ' +
				'for a local file, libsql://<database>.turso.io for a hosted one. See .env.example.'
		};
	}

	// libSQL takes the token from the URL's query as well as from the client's options, so a URL
	// carrying one would be a credential in every line that printed it. Refused rather than
	// stripped: silently ignoring half of what somebody configured is worse than saying so.
	if (parsed.searchParams.has('authToken')) {
		return {
			refusal:
				'CONTROL_PLANE_DATABASE_URL carries an authToken in its query. The token belongs in ' +
				'CONTROL_PLANE_DATABASE_TOKEN, which nothing prints. See .env.example.'
		};
	}

	if (parsed.protocol === 'file:') return { configured: { kind: 'local', url } };

	// A hosted URL that names no host identifies no database, and two ordinary mistakes land here
	// rather than in the branch above, because both parse. A Windows path takes its drive letter
	// for a scheme, so `C:/dev/control-plane.db` is `c:` and would be accepted as hosted the moment
	// a token is set, which is the ordinary configuration. A `libsql:` URL written without the `//`
	// is the other, and it would be announced as `hosted libsql://` with nothing after it.
	if (parsed.host === '') {
		return {
			refusal:
				'CONTROL_PLANE_DATABASE_URL names no host. A hosted database is ' +
				'libsql://<database>.turso.io, and a path on this machine is file:./control-plane.db. ' +
				'See .env.example.'
		};
	}

	if (authToken === '') {
		return {
			refusal:
				`CONTROL_PLANE_DATABASE_TOKEN is not set. A ${parsed.protocol}// URL is a hosted ` +
				'database and refuses every query without one. See .env.example.'
		};
	}

	return { configured: { kind: 'hosted', url, authToken } };
};

/**
 * How long the credential behind a hosted database has left.
 *
 * **The deadline is knowable and nothing else about the token is.** `exp` is read out of an
 * unverified JWT, so a claim in the past is near-certain failure and a claim in the future promises
 * nothing: this account's tokens can also be revoked in bulk, with no propagation time published.
 * That asymmetry is why nothing here refuses. A token past its deadline is announced, loudly, and
 * the process still starts. Refusing would put a working control plane at the mercy of this
 * machine's clock being right, and a wrong line is a much smaller failure than an outage.
 */
export type Expiry =
	| { standing: 'live'; expiresAt: number; remainingMs: number }
	| { standing: 'expired'; expiresAt: number }
	| { standing: 'unreadable' };

/**
 * The `exp` claim, or the honest admission that it could not be read.
 *
 * A JWT is three base64url segments and the middle one is the payload, so this is a decode and a
 * `JSON.parse` and nothing else. **No key, no verification, and no library bought for it**: the
 * remote is what decides whether a token is good, and this reads a number to put in a sentence.
 *
 * **Everything that is not a readable claim is one outcome.** A segment count other than three, a
 * payload that is not an object, an `exp` that is absent or not a finite number, and anything that
 * throws on the way all return `unreadable`. Turso mints JWTs today, and a token that stops being
 * one is a fact about the token rather than grounds to refuse a database that may work perfectly.
 */
export const tokenExpiry = (authToken: string, now: () => number): Expiry => {
	const segments = authToken.split('.');

	if (segments.length !== 3) return { standing: 'unreadable' };

	let claims: unknown;

	try {
		claims = JSON.parse(Buffer.from(segments[1] ?? '', 'base64url').toString('utf8'));
	} catch {
		return { standing: 'unreadable' };
	}

	if (typeof claims !== 'object' || claims === null) return { standing: 'unreadable' };

	const { exp } = claims as { exp?: unknown };

	if (typeof exp !== 'number' || !Number.isFinite(exp)) return { standing: 'unreadable' };

	// RFC 7519 counts `exp` in seconds and every clock here is in milliseconds. This is the one
	// unit error this function can make, which is why its tests state a date rather than compute
	// one: getting it backwards puts the deadline in 1970 or in 56000 AD, and both read as absurd.
	const expiresAt = exp * 1000;
	const remainingMs = expiresAt - now();

	return remainingMs > 0
		? { standing: 'live', expiresAt, remainingMs }
		: { standing: 'expired', expiresAt };
};

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** a count somebody can act on. Days until there is less than one, then hours, because `0 days left` is the line that most needs to be readable. */
const remaining = (ms: number): string => {
	if (ms >= DAY_MS) {
		const days = Math.floor(ms / DAY_MS);

		return `${days} ${days === 1 ? 'day' : 'days'} left`;
	}

	if (ms >= HOUR_MS) {
		const hours = Math.floor(ms / HOUR_MS);

		return `${hours} ${hours === 1 ? 'hour' : 'hours'} left`;
	}

	return 'under an hour left';
};

/** UTC and unambiguous, the spelling [[references/turso]] records its dates in. */
const on = (at: number): string => new Date(at).toISOString().slice(0, 10);

/**
 * What the process says it is connected to.
 *
 * **The raw URL is never printed**, because libSQL accepts `?authToken=` inside one and a startup
 * line that passed whatever the query string held through would be a line that can print a
 * credential. {@link resolveDatabase} refuses such a URL, and this is the other half of the same
 * guard: the announcement is built from the parts that identify a database and from nothing else.
 * The expiry is held to the same rule: it is built from the `exp` claim, and no branch of it echoes
 * any part of the token it was read out of.
 *
 * **`now` is optional so that none of the four entrypoints has to be edited.** They each print what
 * this returns already, which is what makes one function the whole change; a required parameter
 * would mean four call sites and a fifth that somebody forgets.
 */
export const describe = (
	configuration: DatabaseConfiguration,
	now: () => number = Date.now
): string => {
	const parsed = new URL(configuration.url);

	if (configuration.kind === 'hosted') {
		const where = `hosted ${parsed.protocol}//${parsed.host}`;
		const expiry = tokenExpiry(configuration.authToken, now);

		if (expiry.standing === 'unreadable') return `${where}, token expiry unreadable`;

		// The consequence in words rather than a negative number to interpret. When this line is
		// printed the control plane is already answering 503 to everything, from a health route
		// that keeps its reason out of the body on purpose, so this is the only place the cause is
		// written down.
		if (expiry.standing === 'expired') {
			return `${where}, token EXPIRED ${on(expiry.expiresAt)} (every query will fail)`;
		}

		return `${where}, token expires ${on(expiry.expiresAt)} (${remaining(expiry.remainingMs)})`;
	}

	// The configured spelling rather than `parsed.pathname`, which resolves a relative file URL to
	// `/control-plane.db` and so reports a file beside the process as one at the filesystem root.
	// Anything past the path is dropped, which is the rule the hosted line above follows too.
	const [path = ''] = configuration.url.slice(parsed.protocol.length).split(/[?#]/);

	return `local file ${path}`;
};

export const connect = (configuration: DatabaseConfiguration): Client =>
	createClient(
		configuration.kind === 'hosted'
			? { url: configuration.url, authToken: configuration.authToken }
			: { url: configuration.url }
	);

/**
 * For entrypoints only: resolve, or report and end the process.
 *
 * Every entrypoint refuses alike because every one of them calls this, and `database.test.ts`
 * asserts structurally that none of the files directly under `src/` reaches for {@link connect}
 * instead, or reads the two variables for itself.
 *
 * `report` is the caller's because they do not agree on where a line goes: `../main.ts` refuses
 * before a server exists to log through, and the three commands each already build a logger.
 */
export const connectOrExit = (
	report: (message: string) => void
): { client: Client; describedAs: string } => {
	const resolution = resolveDatabase(process.env);

	if ('refusal' in resolution) {
		report(resolution.refusal);
		process.exit(1);
	}

	return {
		client: connect(resolution.configured),
		describedAs: describe(resolution.configured)
	};
};

export const database = (client: Client) => drizzle(client, { schema, casing: 'snake_case' });

export type Database = ReturnType<typeof database>;
