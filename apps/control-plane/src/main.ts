// Before anything reads `process.env`, and it is an import rather than a call so that it
// runs before the module bodies below it do. `.env.example` documents variables the server
// would otherwise ignore — drizzle-kit loaded them for its own commands and nothing loaded
// them for this one.
import 'dotenv/config';

import { connect, database, databaseUrl } from './database.ts';
import { verifyAgainstGoogle } from './google.ts';
import { controlPlaneServer } from './server.ts';

/**
 * The control plane, running.
 *
 * **This file is wiring and nothing else.** What the routes are is `./server.ts`, which takes
 * its database, its clock and its way of verifying an identity as arguments — so the tests run
 * the real routes and only this file reaches for a real network and a real file.
 *
 * Creating a workspace database and minting a token is #556; settling a hosted schema at the
 * mint is #557. Nothing is deployed.
 */
const port = Number(process.env.PORT ?? 4000);

const client = connect();

const server = controlPlaneServer({
	db: database(client),
	verifyIdentity: verifyAgainstGoogle()
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
