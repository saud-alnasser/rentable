// Pins this application's half of shape and elevation: every corner is a step of the token
// layer's radius ladder and every shadow one of its named heights, as [[rules/frontend]] *Styling*
// lists them. A length written into a class is a surface deciding its own shape, and a shadow
// written as a length is one that reads in a single appearance.
//
// `packages/design/src/lib/tests/shape.test.ts` holds the same scan for the package, and the
// ladder and heights themselves. Each package scans its own tree and neither reaches across.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { sourceFiles } from '#tests/source.ts';

function occurrences(pattern: RegExp) {
	return sourceFiles().flatMap(({ file, label }) =>
		[...readFileSync(file, 'utf8').matchAll(pattern)].map((match) => ({ label, token: match[0] }))
	);
}

describe('shape and elevation', () => {
	it('has no arbitrary radius anywhere in the application', () => {
		assert.deepEqual(
			occurrences(/\brounded(?:-[a-z]{1,2})?-\[[^\]]*\]/g),
			[],
			'use a step of the ladder in [[rules/frontend]] *Styling*, or rounded-inherit'
		);
	});

	it('has no arbitrary shadow anywhere in the application', () => {
		assert.deepEqual(
			occurrences(/\bshadow-\[[^\]]*\]/g),
			[],
			'use shadow-raised, shadow-overlay or inset-shadow-sunken'
		);
	});
});
