import assert from 'node:assert/strict';
import { test } from 'node:test';

import ar from '$lib/i18n/ar';
import en from '$lib/i18n/en';

// ticket 33 of effort 832, from the second walk of ticket 27: a description started in lower case
// in the settings area and in capitals in an empty state, and Turso was "turso" in english and
// "Turso" in arabic. The convention is [[rules/frontend]]'s, under *i18n*: the locale files are
// lower case, a heading is raised to sentence case where it renders, a description reads as
// written, and a product's name keeps its capital. What renders is held by the design package's
// own tests; this holds the words.

/** the names a sentence may open on in capitals, because they are names. */
const PROPER_NAMES = ['Turso'];

/** every leaf of a translation tree, keyed by its dotted path. */
function leaves(tree: object, prefix = ''): Record<string, string> {
	const out: Record<string, string> = {};

	for (const [key, value] of Object.entries(tree)) {
		const path = prefix ? `${prefix}.${key}` : key;

		if (value && typeof value === 'object') {
			Object.assign(out, leaves(value, path));
		} else {
			out[path] = String(value);
		}
	}

	return out;
}

/** the descriptions: every string whose key, or a key above it, names it one. */
const descriptions = (tree: object) =>
	Object.entries(leaves(tree)).filter(([path]) => /description/i.test(path));

/**
 * how a string opens, where that is a matter of case: `lower`, `upper`, or `none` where its first
 * letter has no case (Arabic) or it opens on a proper name.
 */
function opening(text: string): 'lower' | 'upper' | 'none' {
	const trimmed = text.trimStart();

	if (PROPER_NAMES.some((name) => trimmed.startsWith(name))) {
		return 'none';
	}

	const first = [...trimmed].find((character) => /\p{L}/u.test(character)) ?? '';

	if (first === first.toLowerCase() && first !== first.toUpperCase()) return 'lower';
	if (first === first.toUpperCase() && first !== first.toLowerCase()) return 'upper';

	return 'none';
}

for (const [name, locale] of [
	['english', en],
	['arabic', ar]
] as const) {
	test(`every ${name} description opens in lower case, as the locale is written`, () => {
		const found = descriptions(locale);

		// not vacuous: the settings area, the empty states and the statuses all carry one.
		assert.ok(found.length > 50, `${found.length} descriptions`);

		const raised = found.filter(([, text]) => opening(text) === 'upper').map(([path]) => path);

		assert.deepEqual(raised, []);
	});

	test(`Turso is written one way in ${name}, with its capital`, () => {
		const written = Object.entries(leaves(locale)).flatMap(([path, text]) =>
			// a host name is an address, not the product's name: `app.turso.tech` stays as typed.
			[...text.matchAll(/(?<![\w.])turso(?!\w|\.\w)/gi)].map((match) => [path, match[0]] as const)
		);

		assert.ok(written.length > 10, `${written.length} mentions`);
		assert.deepEqual(
			written.filter(([, spelling]) => spelling !== 'Turso'),
			[]
		);
	});
}
