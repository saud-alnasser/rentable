import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createClient, type Client } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';

import type { GoogleIdentity, VerifyGoogleIdentity } from '../account/google.ts';
import type { ControlPlane } from '../server/server.ts';
import type { ConnectToWorkspaceDatabase } from '../workspace/migration.ts';
import type { TursoPlatform } from '../workspace/turso.ts';
import { migrate } from 'drizzle-orm/libsql/migrator';

import * as schema from '../database/schema.ts';

/**
 * An empty control-plane database, migrated, in memory.
 *
 * **The same client type production uses**, which is the property that makes a test over it
 * worth running: the row mapping under test is the row mapping that ships. It is also the real
 * migrations rather than a hand-written `CREATE TABLE`, so a migration that does not apply
 * fails here rather than on the first deploy.
 */
export const freshDatabase = async () => {
	// A file in a throwaway directory rather than `:memory:`, and it is not a preference. An
	// in-memory libSQL database belongs to its connection, and a transaction takes another one —
	// so the moment anything under test opened a transaction, the tables were gone. A file is
	// also what production is, which is the property that makes a test over it worth running.
	const directory = await mkdtemp(join(tmpdir(), 'control-plane-'));
	const client = createClient({ url: `file:${join(directory, 'control-plane.db')}` });
	const db = drizzle(client, { schema, casing: 'snake_case' });

	await migrate(db, {
		migrationsFolder: fileURLToPath(new URL('../../migrations', import.meta.url))
	});

	return {
		db,
		close: async () => {
			client.close();

			// `maxRetries` because Windows does not release the handle the instant the client is
			// closed, and swallowed because a temporary file this test could not remove is not a
			// reason to fail the thing it was testing.
			await rm(directory, {
				recursive: true,
				force: true,
				maxRetries: 5,
				retryDelay: 50
			}).catch(() => {});
		}
	};
};

/**
 * a Google that vouches for whatever it is given, answering with the identity you name.
 */
export const googleVouchingFor =
	(identity: GoogleIdentity): VerifyGoogleIdentity =>
	async () =>
		identity;

export const SOMEBODY = {
	subject: 'google-subject-1',
	email: 'amal@example.com',
	displayName: 'Amal Nasser',
	avatarUrl: 'https://example.com/amal.png'
};

/**
 * A Turso that answers in memory.
 *
 * It keeps what it was asked to create and what it minted, so a test can assert that a workspace
 * really did provision a database of its own and that a token was scoped to that one — which is
 * the whole of acceptance criterion 2 on the server's side. `refuse` makes every call fail, for
 * the path where a database is created and the record naming it is not.
 */
export const tursoInMemory = ({ refuse = false }: { refuse?: boolean } = {}) => {
	const databases = new Set<string>();
	const minted: { database: string; expiration: string }[] = [];
	const deleted: string[] = [];

	const refusing = () => {
		throw new Error('turso said no');
	};

	return {
		databases,
		minted,
		deleted,
		platform: {
			createDatabase: async (name: string) => {
				if (refuse) refusing();
				databases.add(name);
				return { name, hostname: `${name}-org.aws-eu-west-1.turso.io` };
			},
			mintToken: async (database: string, expiration: string) => {
				if (refuse) refusing();
				minted.push({ database, expiration });
				return `jwt-for-${database}-${minted.length}`;
			},
			deleteDatabase: async (name: string) => {
				deleted.push(name);
				databases.delete(name);
			}
		} satisfies TursoPlatform
	};
};

/**
 * Hosted workspace databases, on files this test owns.
 *
 * **The third database, and the one the migration path is about** — not the control plane's own,
 * and not a replica of anybody's. It is the *same libSQL client* a deployed control plane opens
 * against Turso, against a `file:` URL instead of a `libsql://` one, so the migration under test
 * is applied by the code that ships, statement by statement, to a real SQLite database. What a
 * live account would add is the network and Turso's own token check; what happens to the schema
 * is exercised here.
 *
 * `opened` is every url that was connected to, so a test can assert that a mint that should not
 * have migrated did not open anything at all.
 */
export const workspaceDatabases = async () => {
	const directory = await mkdtemp(join(tmpdir(), 'workspace-databases-'));
	const clients: Client[] = [];
	const opened: string[] = [];

	// A file per url, named by it — Turso's hostnames are legal filenames once the dots are gone,
	// and two connections to one workspace have to reach one database or nothing is being tested.
	const fileFor = (url: string) => join(directory, `${url.replace(/[^a-z0-9]+/gi, '-')}.db`);

	const connect: ConnectToWorkspaceDatabase = ({ url }) => {
		opened.push(url);

		const client = createClient({ url: `file:${fileFor(url)}` });
		clients.push(client);

		return client;
	};

	return {
		connect,
		opened,
		/** what is in one of them afterwards, read with a client of the test's own. */
		open: (url: string) => {
			const client = createClient({ url: `file:${fileFor(url)}` });
			clients.push(client);

			return client;
		},
		close: async () => {
			for (const client of clients) {
				client.close();
			}

			await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).catch(
				() => {}
			);
		}
	};
};

/**
 * The real routes, listening on a port the operating system picked.
 *
 * Over a socket rather than by calling the handlers, because half of what this covers is the
 * transport: the status code, the body shape, and the method-and-path pair that decides which
 * route ran at all.
 */
export const runningControlPlane = async (plane: ControlPlane) => {
	const { controlPlaneServer } = await import('../server/server.ts');
	const server = controlPlaneServer(plane);

	// Port 0 and a real socket, as before. What changed is only the shape of the call: a Fastify
	// instance takes an options object and returns a promise where `node:http` took positional
	// arguments and a callback. `inject()` would be faster and would skip the transport, which is
	// half of what these tests cover and all of what this change replaced.
	await server.listen({ port: 0, host: '127.0.0.1' });

	const address = server.server.address();

	if (address === null || typeof address === 'string') {
		throw new Error('the control plane listened on nothing a test can reach');
	}

	return {
		url: `http://127.0.0.1:${address.port}`,
		close: () => server.close()
	};
};

/**
 * What a route answers with, whichever half of it.
 *
 * `fetch` types a decoded body as `unknown` and every assertion over one reaches into it, so the
 * shape is named once rather than cast at each of a hundred call sites. **The members mirror
 * `server.ts`'s `wireAccount`, `wireWorkspace` and `wireSession` in full**, because a narrower copy
 * is a shape nothing produces and the second reader of it cannot tell which fields are missing
 * because a route omits them and which because somebody typed fewer.
 *
 * Here rather than in a test file because two test files need it, and
 * [[rules/testing]] puts what tests share in this module.
 */
export type Answer = {
	account?: {
		id: string;
		email: string;
		displayName: string;
		avatarUrl: string | null;
		googleUserId: string;
		createdAt: number;
		updatedAt: number;
	};
	workspace?: {
		id: string;
		name: string;
		ownerAccountId: string;
		permissions: number;
		createdAt: number;
		updatedAt: number;
	};
	session?: { token: string; expiresAt: number; absoluteExpiresAt: number };
	token?: string;
	url?: string;
	expiresAt?: number;
	error?: { code: string; message: string };
	status?: string;
};

export const answerOf = async (response: Response): Promise<Answer> =>
	(await response.json()) as Answer;

/**
 * A request at one of the routes, with a bearer credential unless one is refused outright.
 *
 * `token: null` sends no authorization header at all, which is a different case from an
 * unrecognised one and is the only way to reach the unauthenticated refusal.
 */
export const post = (
	url: string,
	path: string,
	{ token = 'a-token', body }: { token?: string | null; body?: unknown } = {}
) =>
	fetch(`${url}${path}`, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			...(token === null ? {} : { authorization: `Bearer ${token}` })
		},
		body: typeof body === 'string' ? body : body === undefined ? undefined : JSON.stringify(body)
	});
