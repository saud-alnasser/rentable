import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

import { resolveDatabase } from './src/database/database.ts';

/**
 * The same rule the process starts under, rather than a second copy of it here.
 *
 * A migrate and a running control plane that disagreed about which database is configured would
 * apply migrations to one and serve from the other, and the way that used to happen was this file
 * and `database.ts` both falling back to `file:./control-plane.db`. Neither does now: with nothing
 * configured, `pnpm db:migrate:control-plane` refuses instead of building a stray file.
 *
 * **It refuses every drizzle-kit command, including the two that open no database.** `generate`
 * reads `schema.ts` and `migrations/`, and `check` reads `migrations/`, so both worked on a clone
 * with no `.env` while the fallback existed and now do not. Deferring the refusal behind a getter
 * on `dbCredentials` was tried and does not help: drizzle-kit reads it while validating the config,
 * before it knows which command it is running. The alternative left is reading `process.argv` here
 * to decide, which is a second thing to be wrong about. #758 carries the decision; the cost is
 * paid here rather than hidden.
 */
const resolution = resolveDatabase(process.env);

if ('refusal' in resolution) throw new Error(resolution.refusal);

const { configured } = resolution;

export default defineConfig({
	// `turso` rather than `sqlite`: the same dialect over libSQL, which is what lets one
	// generated migration apply to the local file and to the hosted database unchanged.
	dialect: 'turso',
	schema: './src/database/schema.ts',
	out: './migrations',
	verbose: false,
	strict: true,
	casing: 'snake_case',
	dbCredentials: {
		url: configured.url,
		authToken: configured.kind === 'hosted' ? configured.authToken : undefined
	}
});
