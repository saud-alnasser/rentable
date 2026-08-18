// Before anything reads `process.env`, for the same reason `./main.ts` does it — an import
// rather than a call, so it runs before the module bodies below it.
import 'dotenv/config';

import { createClient } from '@libsql/client';

import { connect, database, databaseUrl } from './database/database.ts';
import { sweepWorkspaceSchemas } from './workspace/sweep.ts';
import { tursoPlatform } from './workspace/turso.ts';

/**
 * The sweep, run by a person.
 *
 * **Wiring and nothing else**, like `./main.ts` — what a sweep *is* lives in
 * `./workspace/sweep.ts`, which takes its database, its Turso and its way of opening a workspace
 * database as arguments, so the tests run the real thing.
 *
 * **It is a command rather than a step in a deploy, and that is the whole of decision 06's
 * "mechanism, not owner".** The mint owns a hosted workspace's schema: a workspace takes its
 * migration the next time somebody opens it, and one nobody opens costs nothing. This exists for
 * the case that cannot serve — a migration with a deadline — and running it is somebody's
 * decision on a day they picked.
 *
 * **It takes every workspace to what this build ships, which the mint will not do**, so a
 * workspace it moves past a client's version refuses that client until the application is
 * updated. That is what a deadline means, and it is why nothing runs this automatically.
 *
 *     pnpm --filter ./apps/control-plane sweep
 */
const required = (name: string): string => {
	const value = process.env[name]?.trim();

	if (!value) {
		console.error(`${name} is not set. See .env.example — a sweep cannot reach Turso without it.`);
		process.exit(1);
	}

	return value;
};

const client = connect();

const { swept, failed, target } = await sweepWorkspaceSchemas(
	database(client),
	tursoPlatform({
		apiToken: required('TURSO_API_TOKEN'),
		organization: required('TURSO_ORG'),
		group: required('TURSO_GROUP')
	}),
	({ url, authToken }) => createClient({ url, authToken }),
	{ now: Date.now() }
);

client.close();

console.info(`swept ${databaseUrl()} to workspace schema version ${target}`);

for (const one of swept) {
	console.info(
		one.from === one.to
			? `${one.workspaceId} was already at ${one.to}`
			: `${one.workspaceId} ${one.from} -> ${one.to}`
	);
}

for (const one of failed) {
	console.error(`${one.workspaceId} could not be migrated: ${one.reason}`);
}

// A non-zero exit where anything failed, because the caller of a sweep is a person or a schedule
// and both read the exit code before they read the log.
process.exit(failed.length === 0 ? 0 : 1);
