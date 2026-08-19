// Before anything reads `process.env`, and it is an import rather than a call so that it
// runs before the module bodies below it do. `.env.example` documents variables the server
// would otherwise ignore — drizzle-kit loaded them for its own commands and nothing loaded
// them for this one.
import 'dotenv/config';

import { connect, database, databaseUrl } from './database/database.ts';
import { verifyAgainstGoogle } from './account/google.ts';
import { controlPlaneServer } from './server/server.ts';
import { tursoPlatform } from './workspace/turso.ts';

/**
 * The control plane, running.
 *
 * **This file is wiring and nothing else.** What the routes are is `./server.ts`, which takes its
 * database, its clock, its way of verifying an identity and its way of reaching Turso as
 * arguments — so the tests run the real routes, and only this file reaches for a real network, a
 * real file, and somebody's cloud account.
 *
 * Settling a hosted workspace's schema at the mint is #557. Nothing is deployed.
 */
const port = Number(process.env.PORT ?? 4000);

/**
 * Refused at startup rather than at the first workspace somebody tries to create.
 *
 * A control plane that starts without the credential it provisions with looks healthy, answers
 * `/health`, signs people in, and then fails the one route it exists for — at which point the
 * failure reads as Turso being down.
 */
const required = (name: string): string => {
	const value = process.env[name]?.trim();

	if (!value) {
		console.error(
			`${name} is not set. See .env.example — the control plane cannot provision without it.`
		);
		process.exit(1);
	}

	return value;
};

const client = connect();

const server = controlPlaneServer({
	db: database(client),
	verifyIdentity: verifyAgainstGoogle(),
	platform: tursoPlatform({
		apiToken: required('TURSO_API_TOKEN'),
		organization: required('TURSO_ORG'),
		group: required('TURSO_GROUP')
	})
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
