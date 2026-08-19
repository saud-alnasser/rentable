import { createClient, type Client } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';

import * as schema from './schema.ts';

/**
 * Where the control plane's own database is.
 *
 * A `file:` URL locally and a `libsql://` one once this is deployed, through the same client —
 * which is why libSQL is here rather than the `better-sqlite3` the desktop tests run on.
 * Deploying is out of scope for this effort; picking a client that cannot be deployed without
 * being replaced is not the same thing as deferring it.
 */
export const databaseUrl = (): string =>
	process.env.CONTROL_PLANE_DATABASE_URL ?? 'file:./control-plane.db';

export const connect = (): Client =>
	createClient({
		url: databaseUrl(),
		// A local file needs none. A hosted database refuses without one, and saying so at the
		// point of connection is cheaper than a query that fails later for no visible reason.
		authToken: process.env.CONTROL_PLANE_DATABASE_TOKEN
	});

export const database = (client: Client = connect()) =>
	drizzle(client, { schema, casing: 'snake_case' });

export type Database = ReturnType<typeof database>;
