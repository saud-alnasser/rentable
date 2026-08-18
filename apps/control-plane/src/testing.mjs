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
	const client = createClient({ url: ':memory:' });
	const db = drizzle(client, { schema, casing: 'snake_case' });

	await migrate(db, {
		migrationsFolder: fileURLToPath(new URL('../migrations', import.meta.url))
	});

	return { db, close: () => client.close() };
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
