import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

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
		url: process.env.CONTROL_PLANE_DATABASE_URL ?? 'file:./control-plane.db',
		authToken: process.env.CONTROL_PLANE_DATABASE_TOKEN
	}
});
