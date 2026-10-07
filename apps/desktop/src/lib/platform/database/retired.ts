/**
 * RETIRED RECORDS
 *
 * Every statement the application sends keeps a retired tenant, complex or contract out of what
 * it reads (effort 857, requirement 14).
 *
 * Two machines saving the same record while apart make two records the same in every field a
 * person entered, and the pass after a pull (`tauri/src/database/heal.rs`) keeps the earlier and
 * retires the later: `merged_into` names the record it went into. The retired record stays in the
 * table, so an edit a machine that had not heard of the merge makes to it still lands somewhere
 * the pass can carry it from, and it is never read.
 *
 * **One place rather than a condition in every query.** A read of these three tables is written
 * in some sixty places, through drizzle and through `sql` templates, and a condition each of them
 * has to remember is one the next of them forgets, with nothing failing: the record simply shows
 * twice. So {@link keepRetiredOut} rewrites the statement itself, in `createDatabase`, which every
 * client is built by (`./client`): production's, a workspace reached over the shell, and every
 * test's. Wherever a statement reads `tenant`, `complex` or `contract` after `from` or `join`, it
 * gains `"<name>"."merged_into" is null`: in the `on` of a join, so a left join still answers its
 * row with nothing beside it, and in the `where` of the select that reads it otherwise. The base
 * table stays the table, so every index it has is still used, which a subquery or a view in its
 * place was measured not to keep on the engine the replica runs.
 *
 * A write is left alone: `delete from` names the table it deletes from, and an `update` or an
 * `insert` names no table after `from` unless it reads one, which is then kept clear like any
 * other read. So an edit made to a retired record by its id still lands on it, which is what lets
 * the pass carry it to the record that stayed.
 */

import { getTableColumns, getTableName, is } from 'drizzle-orm';
import { SQLiteTable } from 'drizzle-orm/sqlite-core';

import * as schema from './schema';

/** The column that says a record was retired, and into which record. */
export const RETIRED_COLUMN = 'merged_into';

/**
 * The tables whose records can be retired: every table of the schema holding
 * {@link RETIRED_COLUMN}, read off the schema rather than listed, so a kind that gains the column
 * is kept clear by that alone.
 */
export const RETIRABLE: readonly string[] = (Object.values(schema) as unknown[])
	.filter((table): table is SQLiteTable => is(table, SQLiteTable))
	.filter((table) =>
		Object.values(getTableColumns(table)).some((column) => column.name === RETIRED_COLUMN)
	)
	.map((table) => getTableName(table));

/** Whether a statement could name one of {@link RETIRABLE} at all. */
const MENTIONS = new RegExp(RETIRABLE.join('|'), 'i');

type Kind = 'word' | 'name' | 'string' | 'open' | 'close' | 'end' | 'other';

type Token = {
	kind: Kind;
	/** a word lower-cased, a quoted name unquoted, anything else as written. */
	value: string;
	start: number;
	end: number;
	/** how many brackets enclose it; a bracket itself is at the depth outside it. */
	depth: number;
};

/** The words that end a `where` at its own depth. */
const ENDS_A_WHERE = new Set([
	'group',
	'order',
	'limit',
	'having',
	'window',
	'union',
	'intersect',
	'except',
	'returning'
]);

/** The words that end the `on` of a join at its own depth: those, and the next join or `where`. */
const ENDS_AN_ON = new Set([
	...ENDS_A_WHERE,
	'where',
	'join',
	'inner',
	'left',
	'right',
	'full',
	'cross',
	'natural'
]);

/** Words that follow a table and are never its alias. */
const NOT_AN_ALIAS = new Set([...ENDS_AN_ON, 'on', 'using', 'as', 'indexed', 'not', 'set']);

/**
 * `sql` with every read of a retired tenant, complex or contract kept out, as this module's
 * comment says. A statement reading none of them comes back as it was.
 */
export function keepRetiredOut(sql: string): string {
	// most statements name none of the three; they are answered without being read twice.
	if (!MENTIONS.test(sql)) {
		return sql;
	}

	const tokens = tokenize(sql);
	const insertions: { at: number; rank: number; text: string }[] = [];
	// the predicates each select's `where` gains, by the token it is written at: its `where`, or
	// the token that ends the select where it has none.
	const wheres = new Map<number, string[]>();

	tokens.forEach((token, at) => {
		if (token.kind !== 'word' || (token.value !== 'from' && token.value !== 'join')) {
			return;
		}

		const table = tokens[at + 1];

		if (!isRetirable(table) || tokens[at + 2]?.value === '.') {
			return;
		}

		if (
			token.value === 'from' &&
			tokens[at - 1]?.kind === 'word' &&
			tokens[at - 1].value === 'delete'
		) {
			return;
		}

		const [alias, last] = aliasAfter(tokens, at + 1);
		const predicate = `${quote(alias)}.${quote(RETIRED_COLUMN)} is null`;

		if (token.value === 'join') {
			const on = sibling(tokens, last + 1, token.depth, (next) =>
				next.kind === 'word' && next.value === 'on'
					? 'found'
					: endsAt(next, token.depth, ENDS_AN_ON)
			);

			if (on !== null && tokens[on].value === 'on') {
				const end = sibling(tokens, on + 1, token.depth, (next) =>
					endsAt(next, token.depth, ENDS_AN_ON) ? 'found' : null
				);

				insertions.push({ at: tokens[on].end, rank: 2, text: ` ${predicate} and` });
				insertions.push({ at: tokens[on + 1].start, rank: 3, text: '(' });
				insertions.push({ at: tokens[(end ?? tokens.length) - 1].end, rank: 0, text: ')' });

				return;
			}
		}

		const where = sibling(tokens, last + 1, token.depth, (next) =>
			next.kind === 'word' && next.value === 'where'
				? 'found'
				: endsAt(next, token.depth, ENDS_A_WHERE)
		);
		const key = where ?? tokens.length;

		wheres.set(key, [...(wheres.get(key) ?? []), predicate]);
	});

	for (const [at, predicates] of wheres) {
		const token = tokens[at];

		if (token?.kind === 'word' && token.value === 'where') {
			const end = sibling(tokens, at + 1, token.depth, (next) =>
				endsAt(next, token.depth, ENDS_A_WHERE) ? 'found' : null
			);

			insertions.push({ at: token.end, rank: 2, text: ` ${predicates.join(' and ')} and` });
			insertions.push({ at: tokens[at + 1].start, rank: 3, text: '(' });
			insertions.push({ at: tokens[(end ?? tokens.length) - 1].end, rank: 0, text: ')' });
		} else {
			insertions.push({
				at: tokens[at - 1].end,
				rank: 1,
				text: ` where ${predicates.join(' and ')}`
			});
		}
	}

	if (insertions.length === 0) {
		return sql;
	}

	insertions.sort((one, other) => one.at - other.at || one.rank - other.rank);

	let written = '';
	let from = 0;

	for (const insertion of insertions) {
		written += sql.slice(from, insertion.at) + insertion.text;
		from = insertion.at;
	}

	return written + sql.slice(from);
}

function isRetirable(token: Token | undefined): boolean {
	return (
		token !== undefined &&
		(token.kind === 'name' || token.kind === 'word') &&
		RETIRABLE.includes(token.value.toLowerCase())
	);
}

/** The name a table at `at` is read by, its own or its alias, and the last token naming it. */
function aliasAfter(tokens: Token[], at: number): [string, number] {
	const table = tokens[at].value;
	const next = tokens[at + 1];

	if (next?.kind === 'word' && next.value === 'as' && isName(tokens[at + 2])) {
		return [tokens[at + 2].value, at + 2];
	}

	if (isName(next)) {
		return [next.value, at + 1];
	}

	return [table, at];
}

/** Whether a token can be an alias: a quoted name, or a word that is no keyword. */
function isName(token: Token | undefined): token is Token {
	return (
		token !== undefined &&
		(token.kind === 'name' || (token.kind === 'word' && !NOT_AN_ALIAS.has(token.value)))
	);
}

/** Whether `token` ends a clause at `depth`: one of `words` there, or anything closing it. */
function endsAt(token: Token, depth: number, words: Set<string>): 'found' | null {
	if (token.kind === 'end' || token.depth < depth) {
		return 'found';
	}

	if (token.depth === depth && token.kind === 'word' && words.has(token.value)) {
		return 'found';
	}

	return token.depth === depth && token.kind === 'other' && token.value === ';' ? 'found' : null;
}

/**
 * The index of the first token from `from` that `test` finds, among the tokens at `depth` and the
 * one closing it; `null` where the statement ends first.
 */
function sibling(
	tokens: Token[],
	from: number,
	depth: number,
	test: (token: Token) => 'found' | null
): number | null {
	for (let at = from; at < tokens.length; at += 1) {
		const token = tokens[at];

		if (token.depth > depth) {
			continue;
		}

		if (test(token) === 'found') {
			return at;
		}
	}

	return null;
}

function quote(name: string): string {
	return `"${name.replaceAll('"', '""')}"`;
}

/** `sql` as its tokens, with whitespace and comments dropped, ending in an `end` token. */
function tokenize(sql: string): Token[] {
	const tokens: Token[] = [];
	let depth = 0;
	let at = 0;

	const push = (kind: Kind, value: string, start: number, end: number) => {
		if (kind === 'close') {
			depth = Math.max(0, depth - 1);
		}

		tokens.push({ kind, value, start, end, depth });

		if (kind === 'open') {
			depth += 1;
		}
	};

	while (at < sql.length) {
		const character = sql[at];

		if (/\s/.test(character)) {
			at += 1;
		} else if (sql.startsWith('--', at)) {
			const line = sql.indexOf('\n', at);

			at = line === -1 ? sql.length : line + 1;
		} else if (sql.startsWith('/*', at)) {
			const close = sql.indexOf('*/', at + 2);

			at = close === -1 ? sql.length : close + 2;
		} else if (character === "'" || character === '"' || character === '`' || character === '[') {
			const closing = character === '[' ? ']' : character;
			let end = at + 1;
			let value = '';

			while (end < sql.length) {
				if (sql[end] === closing) {
					// a quote written twice is one quote inside the quoted text.
					if (closing !== ']' && sql[end + 1] === closing) {
						value += closing;
						end += 2;
						continue;
					}

					break;
				}

				value += sql[end];
				end += 1;
			}

			push(character === "'" ? 'string' : 'name', value, at, Math.min(end + 1, sql.length));
			at = end + 1;
		} else if (/[A-Za-z_]/.test(character)) {
			const word = /^[A-Za-z_][A-Za-z0-9_$]*/.exec(sql.slice(at))![0];

			push('word', word.toLowerCase(), at, at + word.length);
			at += word.length;
		} else if (character === '(') {
			push('open', character, at, at + 1);
			at += 1;
		} else if (character === ')') {
			push('close', character, at, at + 1);
			at += 1;
		} else {
			push('other', character, at, at + 1);
			at += 1;
		}
	}

	tokens.push({ kind: 'end', value: '', start: sql.length, end: sql.length, depth: 0 });

	return tokens;
}
