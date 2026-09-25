// Pins this application's half of the type layer: every size comes from the named scale in
// [[rules/frontend]] *Styling*, and no letter spacing reaches a reader's text.
//
// `packages/design/src/lib/tests/typography.test.ts` holds the same two checks for the package,
// and the typeface itself. Each package scans its own tree and neither reaches across.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { sourceFiles } from '#tests/source.ts';

function occurrences(pattern: RegExp) {
	return sourceFiles().flatMap(({ file, label }) =>
		[...readFileSync(file, 'utf8').matchAll(pattern)].map((match) => ({ label, token: match[0] }))
	);
}

/**
 * Where letter spacing is allowed, and only because the text is a machine's rather than a
 * reader's: the link code is letters and digits a person copies across, held `ltr` in both
 * locales, and the spacing is what lets them read it back in groups. Anything else with tracking
 * would space out Arabic letters that are meant to join.
 */
const TRACKING_ALLOWED = [
	{ label: 'lib/organization/component/connect-screen.svelte', token: 'tracking-[0.3em]' },
	{ label: 'lib/organization/component/link-handover.svelte', token: 'tracking-[0.3em]' }
];

describe('the type scale', () => {
	it('has no arbitrary text size anywhere in the application', () => {
		assert.deepEqual(
			occurrences(/\btext-\[[^\]]*\]/g),
			[],
			'use a size from the scale in [[rules/frontend]] *Styling*'
		);
	});

	it('puts letter spacing on machine strings alone', () => {
		const found = occurrences(/\btracking-[\w.[\]%-]+/g);

		for (const allowed of TRACKING_ALLOWED) {
			assert.ok(
				found.some(({ label, token }) => label === allowed.label && token === allowed.token),
				`allowlisted tracking no longer exists: ${allowed.label} ${allowed.token}`
			);
		}

		const offenders = found.filter(
			({ label, token }) =>
				!TRACKING_ALLOWED.some((allowed) => allowed.label === label && allowed.token === token)
		);

		assert.deepEqual(offenders, []);
	});
});
