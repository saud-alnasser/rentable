/**
 * A title's words, set in title case the way a person sets one.
 *
 * Every locale string is written lower case, and a title puts the case back when it renders.
 * The CSS `capitalize` did that by raising the first letter of every word, which is how "this
 * machine and turso" became "This Machine And Turso": a joining word is left lower case here, as
 * it is in any written title, unless it opens or closes the title.
 *
 * **Hand it a title and nothing else.** A person's own value (a workspace named "default", a
 * tenant's name) is theirs to case, and a sentence reads as a sentence, so neither is passed
 * through this. Only a word's first letter is raised, so "ID" stays as written, and a script with
 * no case, Arabic among them, comes back unchanged.
 */

/** the joining words a title leaves lower case between its first word and its last. */
const MINOR = new Set([
	'a',
	'an',
	'and',
	'as',
	'at',
	'but',
	'by',
	'for',
	'from',
	'in',
	'into',
	'nor',
	'of',
	'on',
	'or',
	'per',
	'the',
	'to',
	'via',
	'with'
]);

export function toTitleCase(text: string): string {
	const parts = text.split(/(\s+)/);
	const count = parts.filter((part) => part.trim() !== '').length;
	let seen = 0;

	return parts
		.map((part) => {
			if (part.trim() === '') return part;

			seen += 1;

			if (seen > 1 && seen < count && MINOR.has(part)) return part;

			return part.charAt(0).toUpperCase() + part.slice(1);
		})
		.join('');
}
