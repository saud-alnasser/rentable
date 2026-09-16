import assert from 'node:assert/strict';
import { test } from 'node:test';

import ar from '$lib/i18n/ar';
import en from '$lib/i18n/en';

// effort 828, criterion 12: the arabic strings are written rather than copied, and the test that
// says so sweeps the dictionary rather than naming terms one at a time. Ten named terms were
// pinned in `organization.test.ts` and everything else was left to whoever wrote the surface,
// which catches a key somebody meant to translate and misses the one they forgot about.
//
// **What a slip looks like.** An arabic key holding an english sentence is the ordinary one: a key
// added under deadline, copied across from `en/index.ts` and never written. The other direction is
// rarer and worse, because nobody reading english would see it: an arabic phrase left in an
// english string.

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

/**
 * what a sentence is allowed to carry in the other alphabet, and why each one is.
 *
 * **A name is not a translation.** Every entry here is something a reader of either language meets
 * in the same letters: a product, a company, a plan those two sell, an acronym, an address, or a
 * mask. Anything outside this list in arabic is a sentence somebody copied rather than wrote.
 *
 * Each is taken out of the string before the sweep looks at what is left, so `Turso` inside an
 * arabic sentence costs nothing and `turso account` still fails on `account`. The comparison is
 * lowercase, so a name keeps its allowance wherever a sentence happens to capitalise it.
 */
const ALLOWED: readonly (readonly [string, string])[] = [
	// the address itself comes first: taking `turso` out of it would leave `app` and `tech` behind.
	['app.turso.tech', "turso's own dashboard, which both locales point at by address."],
	['rentable', 'the application, which is called the same thing in both languages.'],
	['turso', 'the company an organization lives on. A brand name, and never translated.'],
	['developer', "turso's own name for one of its plans, spelled as their pricing page spells it."],
	['csv', 'the file format, which is its acronym in arabic as it is in english.'],
	['xxxxxxxx', 'the mask in the phone placeholder `5xxxxxxxx`, a shape rather than a word.']
];

/**
 * a translation with its placeholders and its allowed names taken out: what is left is the words
 * somebody wrote.
 *
 * Placeholders go first and go by shape, `{...}`, innermost outward, so typesafe-i18n's
 * `{count:number}`, its formatters and its plural braces `{{one|many}}` all leave nothing behind.
 * They carry latin letters in both locales by construction: the name of a value and the name of
 * its type are code, and translating either would break the interpolation.
 */
function written(value: string): string {
	let text = value;
	let shorter = text.replace(/\{[^{}]*\}/g, ' ');

	while (shorter !== text) {
		text = shorter;
		shorter = text.replace(/\{[^{}]*\}/g, ' ');
	}

	text = text.toLowerCase();

	for (const [token] of ALLOWED) {
		text = text.replaceAll(token, ' ');
	}

	return text;
}

test('every arabic string is written in arabic', () => {
	const slips = Object.entries(leaves(ar))
		.filter(([, value]) => /[a-z]/.test(written(value)))
		.map(([key, value]) => `${key}: ${value}`);

	assert.deepEqual(
		slips,
		[],
		`arabic keys carrying english. Write the sentence, or name what it carries in ALLOWED:\n${slips.join('\n')}`
	);
});

test('every english string is written in english', () => {
	const slips = Object.entries(leaves(en))
		.filter(([, value]) => /[\u0600-\u06FF]/.test(value))
		.map(([key, value]) => `${key}: ${value}`);

	assert.deepEqual(slips, [], `english keys carrying arabic:\n${slips.join('\n')}`);
});

// a sweep that matches nothing passes on a dictionary nobody translated, so what it would catch is
// pinned here rather than taken on trust.
test('the sweep catches a copied sentence in either direction', () => {
	assert.match(written('ask whoever invited you for a new link'), /[a-z]/);
	assert.match(written('يحمل {count:number} من حساب Turso'), /^[^a-z]*$/);
	assert.ok(/[\u0600-\u06FF]/.test('اطلب رابطًا جديدًا'));
	assert.ok(!/[\u0600-\u06FF]/.test('ask whoever invited you for a new link'));
});
