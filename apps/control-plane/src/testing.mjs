import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';

import * as schema from './schema.ts';

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
		migrationsFolder: fileURLToPath(new URL('../migrations', import.meta.url))
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
 *
 * @param {import('./google.ts').GoogleIdentity} identity
 * @returns {import('./google.ts').VerifyGoogleIdentity}
 */
export const googleVouchingFor = (identity) => async () => identity;

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
 *
 * @param {{ refuse?: boolean }} [behaviour]
 */
export const tursoInMemory = ({ refuse = false } = {}) => {
	/** @type {Set<string>} */
	const databases = new Set();
	/** @type {{ database: string; expiration: string }[]} */
	const minted = [];
	/** @type {string[]} */
	const deleted = [];

	const refusing = () => {
		throw new Error('turso said no');
	};

	return {
		databases,
		minted,
		deleted,
		platform: /** @type {import('./turso.ts').TursoPlatform} */ ({
			createDatabase: async (/** @type {string} */ name) => {
				if (refuse) refusing();
				databases.add(name);
				return { name, hostname: `${name}-org.aws-eu-west-1.turso.io` };
			},
			mintToken: async (/** @type {string} */ database, /** @type {string} */ expiration) => {
				if (refuse) refusing();
				minted.push({ database, expiration });
				return `jwt-for-${database}-${minted.length}`;
			},
			deleteDatabase: async (/** @type {string} */ name) => {
				deleted.push(name);
				databases.delete(name);
			}
		})
	};
};

/**
 * The real routes, listening on a port the operating system picked.
 *
 * Over a socket rather than by calling the handlers, because half of what this covers is the
 * transport: the status code, the body shape, and the method-and-path pair that decides which
 * route ran at all.
 *
 * @param {import('./server.ts').ControlPlane} plane
 */
export const runningControlPlane = async (plane) => {
	const { controlPlaneServer } = await import('./server.ts');
	const server = controlPlaneServer(plane);

	await new Promise((listening) => {
		server.listen(0, '127.0.0.1', () => listening(undefined));
	});

	const address = server.address();

	if (address === null || typeof address === 'string') {
		throw new Error('the control plane listened on nothing a test can reach');
	}

	return {
		url: `http://127.0.0.1:${address.port}`,
		close: () => new Promise((closed) => server.close(() => closed(undefined)))
	};
};
