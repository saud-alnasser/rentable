import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	dialect: 'sqlite',
	schema: './src/lib/platform/database/schema.ts',
	// `packages/workspace-migrations`, which is where the SQL a workspace database is built from
	// lives: the same set builds a local workspace here and a hosted one over the wire, through
	// `tauri/src/organization/migrate.rs` and `packages/turso-platform`.
	// `tauri/migrations/` is generated from it by `tauri/build.rs` and is not written by hand or
	// by drizzle-kit.
	out: '../../packages/workspace-migrations/migrations',
	verbose: false,
	strict: true,
	casing: 'snake_case',
	dbCredentials: {
		url: process.env.DATABASE_URL!
	}
});
