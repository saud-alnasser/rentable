import { Column, is, sql, type AnyColumn, type SQL } from 'drizzle-orm';
import { ASCII_ONLY_COLUMNS } from './schema';

/**
 * SEARCH MATCHING
 *
 * One comparison, used by every list and by the palette. A search term and a stored value
 * are reduced to the same comparable form *before* they meet, so a record is found whichever
 * spelling either side happens to hold.
 *
 * Both sides, or neither: a folded pattern compared against an unfolded value matches *less*
 * than an unfolded one does, not more. That is why `foldSearchText` and `foldedSql` below are
 * two renderings of one table rather than two tables — the whole fix is that they agree, and a
 * second list kept in step by hand is a defect waiting for the next character.
 *
 * A side is skipped only where folding it provably could not change what the comparison
 * answers — and then *both* sides are, which is what keeps the rule above intact rather than
 * weakening it: where a side cannot fold, folded and unfolded **are** the same side.
 *
 * - **The stored side** is skipped for a numeric column, an all-ASCII enum, or a text column
 *   the schema refuses non-ASCII into. `storedSideCanFold` holds the reasoning.
 * - **The term** is skipped where it holds no character the table names, on either side of a
 *   substitution. `termSideCanFold` holds the reasoning.
 *
 * That second one is the one that pays: `SEARCH_FOLDINGS.length` nested `replace()` calls per
 * column per row is a full scan no index can serve, most searches are typed in Latin letters,
 * and a term of Latin letters cannot fold and cannot be reached by folding a stored value
 * either.
 */

/** ٠١٢٣٤٥٦٧٨٩ — what `ar-SA` renders every number as, and therefore what a reader types. */
const ARABIC_INDIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'].map(
	(digit, value) => [digit, String(value)] as const
);

/**
 * The separators a number is *rendered* with and never stored with: `1,500` in `en-GB` and
 * `١٬٥٠٠` in `ar-SA` both stand for the `1500` in the column. The group separators go, and
 * the Arabic decimal separator becomes the point SQLite casts a real with.
 */
const NUMBER_SEPARATORS = [
	[',', ''], // U+002C, the en-GB group separator
	['٬', ''], // ٬ the ar-SA group separator
	['٫', '.'] // ٫ the ar-SA decimal separator
] as const;

/**
 * أ إ آ ٱ all write the letter ا carries, and which one a name was entered with is not
 * something the person searching for it recalls — nor something the row displays.
 */
const ALEF_VARIANTS = ['أ', 'إ', 'آ', 'ٱ'].map((variant) => [variant, 'ا'] as const);

/** ة and ه end the same names interchangeably, so the ending is not a distinction here. */
const TAA_MARBUTA = [['ة', 'ه']] as const;

/**
 * The marks that carry no letter: the tatweel, which only stretches a join, and the harakat,
 * which are optional vowel and hamza marks. Both are removed rather than mapped — neither
 * side of the comparison is more correct for having written them.
 *
 * U+064B–U+0655 is the harakat run through the combining hamza and maddah, which is what a
 * decomposed أ is written as; U+0670 is the superscript alef.
 */
const NON_LETTER_MARKS = [
	'ـ', // ـ tatweel
	...Array.from({ length: 0x0655 - 0x064b + 1 }, (_, offset) =>
		String.fromCodePoint(0x064b + offset)
	),
	'ٰ' // superscript (dagger) alef
].map((mark) => [mark, ''] as const);

/**
 * Every substitution a search applies, stated once.
 *
 * Order is not significant: no substitution's output is another's input, so the same set
 * applied in any order lands on the same text.
 *
 * Exported for its own tests: what makes a term fold is derived from this table rather than
 * from a second list, and the only way to assert that is to drive the assertion off the table
 * itself. Nothing outside this module and those tests reads it — the two renderings below are
 * what a caller reaches.
 */
export const SEARCH_FOLDINGS: readonly (readonly [string, string])[] = [
	...ARABIC_INDIC_DIGITS,
	...NUMBER_SEPARATORS,
	...ALEF_VARIANTS,
	...TAA_MARBUTA,
	...NON_LETTER_MARKS
];

/** Reduces a term to the form the comparison runs on — the TypeScript half of the table. */
export function foldSearchText(value: string): string {
	return SEARCH_FOLDINGS.reduce((folded, [from, to]) => folded.split(from).join(to), value);
}

/**
 * The same reduction over a stored value — the SQL half of the table, nested `replace()`
 * calls over the column cast to text.
 *
 * A built-in expression rather than a collation or an extension function: the engine is
 * compiled into the binary and the driver owns it, so a rule registered on a connection
 * would not exist for the in-memory transport the router tests run over.
 */
function foldedSql(value: SQL | AnyColumn): SQL {
	return SEARCH_FOLDINGS.reduce<SQL>(
		(folded, [from, to]) => sql`replace(${folded}, ${from}, ${to})`,
		sql`cast(${value} as text)`
	);
}

/**
 * Whether folding a stored value can change it. Where it cannot, the substitutions are
 * skipped: `SEARCH_FOLDINGS.length` nested `replace()` calls per column per row is the whole
 * cost of this comparison, and on most of the columns searched here it compares a value
 * against itself.
 *
 * Three answers, in the order they are cheap to be sure of:
 *
 * - **A numeric column** renders as ASCII digits whatever was typed to produce it, so no
 *   substitution in the table above can reach it.
 * - **An enum** holds one of a fixed set, and the set is checked rather than assumed — an
 *   enum that ever gains a non-ASCII member starts folding again on its own.
 * - **A text column the schema refuses non-ASCII into**, which only the schema can say, so it
 *   says it: `ASCII_ONLY_COLUMNS`.
 *
 * **Everything else folds, including every SQL expression.** The default is the safe one: a
 * column added tomorrow and never mentioned here folds, which is correct and merely slower,
 * whereas the opposite default would leave it silently unfindable in one of the two spellings.
 * That is also why an expression is never exempted — it has no schema entry to be sure from,
 * and the ledger's day expression is ASCII in fact but not provably so from here.
 */
function storedSideCanFold(value: SQL | AnyColumn): boolean {
	if (!is(value, Column)) {
		return true;
	}

	if (value.dataType === 'number') {
		return false;
	}

	if (value.enumValues?.length) {
		return value.enumValues.some((member) => foldSearchText(member) !== member);
	}

	return !ASCII_ONLY_COLUMNS.includes(value);
}

/**
 * Every character the table above names — the ones a substitution reads *and* the ones it
 * writes — read off the table itself, so a rule added later brings its characters with it and
 * no second list has to be edited to keep up.
 *
 * Both halves of a rule count, and the writing half is the one easy to miss: `ا` is what `أ`
 * folds *to*, so a term written `احمد` reaches a folding rule from the far end and skipping the
 * fold on it would lose the record stored as `أحمد`. The same holds for `1`, which `١` folds
 * to, and for `ه` and for `.`.
 */
const FOLDED_CHARACTERS = new Set(SEARCH_FOLDINGS.flatMap(([from, to]) => [...from, ...to]));

/**
 * Whether folding a search term can change what it matches. Where it cannot, the substitutions
 * are skipped — on the term and on the column both — and the comparison runs on the text as
 * written. This is the half that pays: most terms are typed in Latin letters, and a Latin
 * letter appears nowhere in the table above.
 *
 * The test is the term as written and never the locale. An Arabic-speaking reader types a
 * Latin name and an English-speaking one pastes an Arabic one, and the locale says nothing
 * about which of the two happened here.
 *
 * A term holding none of {@link FOLDED_CHARACTERS} folds to itself, and no substitution can
 * fold a stored value *into* it either: every substitution writes one of those characters or
 * writes nothing at all, so a folded value differs from an unfolded one only in characters
 * this term does not hold.
 *
 * **The one case this gives up** is a stored value with a mark spliced inside an occurrence of
 * the term — folding deletes the harakat and the tatweel, so `Saـra` folds to `Sara` and a term
 * of `Sara` stops reaching it. Those marks are Arabic combining marks and a term that gets here
 * holds no Arabic character at all, so what is given up is a mark sitting inside a run of text
 * that cannot carry one. Written down rather than waved at, because it is the whole distance
 * between this and a proof.
 */
function termSideCanFold(term: string): boolean {
	return Array.from(term).some((character) => FOLDED_CHARACTERS.has(character));
}

/**
 * Match a column against a search term, case-insensitively and in the folded form above.
 *
 * The escaping is not decoration: `%` and `_` are LIKE's own wildcards, so a user searching
 * for "50%" is looking for that text rather than asking to match everything. The `ESCAPE`
 * clause has to be written here — drizzle's `like` emits none, and SQLite has no default
 * escape character, so a backslash without it is matched literally instead of escaping.
 *
 * Folding runs before escaping, which is safe in either order: no substitution above reads
 * or writes `\`, `%`, or `_`, so escaping cannot be undone by folding and folding cannot
 * introduce a wildcard the escape missed.
 *
 * @param column the column to match, cast to text so a number matches by the digits shown.
 * @param term the user's text, taken as written.
 */
export function matchesSearch(column: SQL | AnyColumn, term: string) {
	// Both sides fold or neither does. Where the term cannot fold, folding it is a no-op — so
	// dropping it from the column too is what keeps the two sides comparable, rather than what
	// breaks them apart.
	const folding = termSideCanFold(term);
	const written = folding ? foldSearchText(term) : term;
	const pattern = `%${written.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
	const stored =
		folding && storedSideCanFold(column) ? foldedSql(column) : sql`cast(${column} as text)`;

	return sql`lower(${stored}) like lower(${pattern}) escape '\\'`;
}

/**
 * The same match across several columns — a row is found by any of them.
 *
 * Parenthesised here rather than left to the caller: `and` binds tighter than `or` in SQL,
 * so a bare chain of `or`s dropped into a narrowing `and` reads as `(narrow and first) or
 * rest` and returns rows the narrowing excluded.
 *
 * @param columns the columns a term may be found in; a field dropped from a surface is never
 *   dropped from search.
 * @param term the user's text, taken as written.
 */
export function matchesAnySearch(columns: readonly (SQL | AnyColumn)[], term: string) {
	return sql`(${sql.join(
		columns.map((column) => matchesSearch(column, term)),
		sql` or `
	)})`;
}
