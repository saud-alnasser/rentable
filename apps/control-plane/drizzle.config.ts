import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

import { resolveDatabase } from './src/database/database.ts';
import { opensADatabase } from './src/database/drizzle-kit.ts';

/**
 * The same rule the process starts under, rather than a second copy of it here.
 *
 * A migrate and a running control plane that disagreed about which database is configured would
 * apply migrations to one and serve from the other, and the way that used to happen was this file
 * and `database.ts` both falling back to `file:./control-plane.db`. Neither does now: with nothing
 * configured, `pnpm db:migrate:control-plane` refuses instead of building a stray file.
 *
 * **The refusal reaches the commands that open a database, and only those.** drizzle-kit loads
 * this file for every one of its commands, so until #758 `generate` and `check` refused too, and
 * somebody generating a migration on a fresh clone was told to configure a database they were not
 * about to open. `./src/database/drizzle-kit.ts` is what reads the invocation, and its docstring
 * carries why that is the mechanism and what was tried before it.
 */
const opening = opensADatabase(process.argv);

const credentials = (): { url: string; authToken?: string } => {
	const resolution = resolveDatabase(process.env);

	if ('refusal' in resolution) throw new Error(resolution.refusal);

	const { configured } = resolution;

	return {
		url: configured.url,
		authToken: configured.kind === 'hosted' ? configured.authToken : undefined
	};
};

/**
 * What stands in the required field for a command that opens nothing.
 *
 * `dbCredentials` is required by drizzle-kit's own type for every dialect and read by four of its
 * nine commands, so an offline command has nothing true to put here. **This is deliberately not a
 * database.** It has no scheme, so nothing can open it and nothing can create it, which is the
 * property that separates it from the `file:./control-plane.db` fallback #755 removed: that one
 * worked, quietly, against a file nobody meant to serve from.
 */
const NOTHING_TO_OPEN = 'no-database-is-opened-by-this-drizzle-kit-command';

export default defineConfig({
	// `turso` rather than `sqlite`: the same dialect over libSQL, which is what lets one
	// generated migration apply to the local file and to the hosted database unchanged.
	dialect: 'turso',
	schema: './src/database/schema.ts',
	out: './migrations',
	verbose: false,
	strict: true,
	casing: 'snake_case',
	dbCredentials: opening ? credentials() : { url: NOTHING_TO_OPEN }
});
