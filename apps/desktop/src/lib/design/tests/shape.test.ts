// Pins this application's half of shape and elevation: every corner is a step of the token
// layer's radius ladder and every shadow one of its named heights, as [[rules/frontend]] *Styling*
// lists them. A length written into a class is a surface deciding its own shape, and a shadow
// written as a length is one that reads in a single appearance.
//
// `packages/design/src/lib/tests/shape.test.ts` holds the same scan for the package, and the
// ladder and heights themselves. Each package scans its own tree and neither reaches across.

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const SRC_ROOT = fileURLToPath(new URL('../../..', import.meta.url));

const SOURCE = /\.(svelte|ts|js|css|html)$/;

function toPosix(path: string) {
	return path.split(sep).join('/');
}

// every source file under `src/`, labelled from there. A `tests/` directory is left out: it
// covers these rules rather than obeying them, and this file names the very patterns it forbids.
function sourceFiles() {
	return readdirSync(SRC_ROOT, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile() && SOURCE.test(entry.name))
		.map((entry) => {
			const file = join(entry.parentPath, entry.name);
			return { file, label: toPosix(relative(SRC_ROOT, file)) };
		})
		.filter(({ label }) => !label.split('/').includes('tests'));
}

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
