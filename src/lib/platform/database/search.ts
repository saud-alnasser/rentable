import { sql, type AnyColumn, type SQL } from 'drizzle-orm';

/**
 * Match a column against a search term, case-insensitively.
 *
 * The escaping is not decoration: `%` and `_` are LIKE's own wildcards, so a user searching
 * for "50%" is looking for that text rather than asking to match everything. The `ESCAPE`
 * clause has to be written here — drizzle's `like` emits none, and SQLite has no default
 * escape character, so a backslash without it is matched literally instead of escaping.
 *
 * @param column the column to match, cast to text so a number matches by the digits shown.
 * @param term the user's text, taken as written.
 */
export function matchesSearch(column: SQL | AnyColumn, term: string) {
	const pattern = `%${term.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;

	return sql`lower(cast(${column} as text)) like lower(${pattern}) escape '\\'`;
}
