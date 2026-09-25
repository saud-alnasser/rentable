// Shared scaffolding for the lint tests that read this package's source as text. Not a
// `*.test.ts` file, so the test runner does not pick it up directly.
//
// `apps/desktop/src/tests/source.ts` is the application's copy. Each package scans its own tree
// and neither reaches across, so each keeps its own scanner rather than importing the other's.

import { readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** this package's `src/`, which every label is written from. */
export const SRC_ROOT = fileURLToPath(new URL('..', import.meta.url));

/** the files a surface is written in. */
export const SOURCE = /\.(svelte|ts|js|css|html)$/;

/** a path with the platform's separator replaced by `/`, so a label reads the same everywhere. */
export function toPosix(path: string) {
	return path.split(sep).join('/');
}

/**
 * Every file under `src/` whose name matches, labelled from `src/`.
 *
 * A `tests/` directory is left out: it covers these rules rather than obeying them, and a lint
 * test names the very patterns it forbids.
 */
export function sourceFiles(pattern: RegExp = SOURCE) {
	return readdirSync(SRC_ROOT, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile() && pattern.test(entry.name))
		.map((entry) => {
			const file = join(entry.parentPath, entry.name);
			return { file, label: toPosix(relative(SRC_ROOT, file)) };
		})
		.filter(({ label }) => !label.split('/').includes('tests'));
}
