import assert from 'node:assert/strict';
import { test } from 'node:test';

import ar from '$lib/i18n/ar';
import en from '$lib/i18n/en';

// effort 832, requirement 17: visible text is short and plain. An explanation the interface cannot
// make obvious sits behind a disclosure or in a tooltip, and only the confirmation of an
// irreversible act carries a full sentence of consequence. The sweep reads every english string
// as written, placeholders included, so a sentence cannot grow past the line by hiding in one.

/** the most characters an english string may carry. */
const LIMIT = 120;

/**
 * the confirmations of irreversible acts, which may say their whole consequence, and why each
 * one is. Nothing else goes here: a long description that is not a confirmation is cut or moved
 * behind a disclosure instead.
 */
const IRREVERSIBLE: readonly (readonly [string, string])[] = [
	[
		'layout.signIn.disconnectDescription',
		'the disconnect dialog: it deletes every copy this machine keeps, and it has to say who can connect again and how.'
	]
];

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

test(`no english string is over ${LIMIT} characters, irreversible confirmations aside`, () => {
	const allowed = new Set(IRREVERSIBLE.map(([key]) => key));
	const long = Object.entries(leaves(en))
		.filter(([key, value]) => value.length > LIMIT && !allowed.has(key))
		.map(([key, value]) => `${key} (${value.length}): ${value}`);

	assert.deepEqual(
		long,
		[],
		`english strings over ${LIMIT} characters. Cut them, or move the explanation behind a disclosure:\n${long.join('\n')}`
	);
});

// a key listed here that no longer exists would let the list grow stale without anybody noticing.
test('every irreversible confirmation the list allows is a key in both locales', () => {
	const english = leaves(en);
	const arabic = leaves(ar);

	for (const [key] of IRREVERSIBLE) {
		assert.equal(typeof english[key], 'string', `english has no ${key}`);
		assert.equal(typeof arabic[key], 'string', `arabic has no ${key}`);
	}
});

// the money cell carries the riyal sign (`formatLocaleMoney`), so no sentence names the currency.
test('the remaining balance does not write the currency into the sentence', () => {
	assert.doesNotMatch(en.contracts.payments.remaining, /\bsar\b/i);
	assert.doesNotMatch(ar.contracts.payments.remaining, /ريال/);
});
