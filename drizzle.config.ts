import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	dialect: 'sqlite',
	schema: './src/lib/api/database/schema.ts',
	out: './tauri/migrations',
	verbose: false,
	strict: true,
	casing: 'snake_case',
	dbCredentials: {
		url: process.env.DATABASE_URL!
	}
});
