// Before anything reads `process.env`, and it is an import rather than a call so that it
// runs before the module bodies below it do. `.env.example` documents variables the server
// would otherwise ignore — drizzle-kit loaded them for its own commands and nothing loaded
// them for this one.
import 'dotenv/config';

import { createServer } from 'node:http';

import { sql } from 'drizzle-orm';

import { connect, database, databaseUrl } from './database.ts';

/**
 * The control plane, running.
 *
 * **It serves one route, and that is the honest extent of it today.** Signing in is #555,
 * creating a workspace database and minting a token is #556, and settling a hosted schema at
 * the mint is #557. What this file is for is the thing those three stand on: a process that
 * starts, reaches its database, and can be checked by a developer on their own machine.
 *
 * *The protocol the real routes speak is deliberately not decided here.* The desktop's tRPC
 * runs in-process in the webview with no HTTP under it, so it is not a precedent for this, and
 * the client that will call these routes is the Rust side rather than the web layer —
 * credentials never cross the IPC boundary. Choosing between tRPC over HTTP and plain JSON on
 * behalf of a ticket that has not been built would be choosing an architecture quietly.
 */
const port = Number(process.env.PORT ?? 4000);

const client = connect();
const db = database(client);

const server = createServer((request, response) => {
	if (request.method === 'GET' && request.url === '/health') {
		// The query is the point of the route: a process that answers without having reached
		// its database reports the one thing a health check exists to disprove.
		db.get(sql`select 1`)
			.then(() => {
				response.writeHead(200, { 'content-type': 'application/json' });
				// Whether the database answered, and not which one it is. The URL is on stdout at
				// startup, where the person running it can see it and a caller cannot: this route
				// will be reachable without a credential, and a hostname is the sort of thing that
				// is harmless right up until it is the one piece somebody was missing.
				response.end(JSON.stringify({ status: 'ok' }));
			})
			.catch((error: unknown) => {
				response.writeHead(503, { 'content-type': 'application/json' });
				response.end(JSON.stringify({ status: 'unreachable', reason: String(error) }));
			});

		return;
	}

	response.writeHead(404, { 'content-type': 'application/json' });
	response.end(JSON.stringify({ status: 'not found' }));
});

server.listen(port, () => {
	console.info(`control plane listening on http://localhost:${port}, database ${databaseUrl()}`);
});

const stop = () => {
	server.close(() => {
		client.close();
	});
};

process.on('SIGINT', stop);
process.on('SIGTERM', stop);
