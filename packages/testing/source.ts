// The scanner the lint tests read source through, as text. Shared scaffolding rather than a test,
// and one copy for both packages that have such tests: the application's `src/tests/source.ts` and
// the design package's each bind it to their own `src/` and hand the result to their tests, so
// each package still scans its own tree and neither reaches into the other's.
//
// It is a package of its own because neither of the two can hold it for the other. The design
// package may not import the application, and its `exports` map covers `src/lib/` alone, which is
// what keeps its scaffolding out of every consumer.

import { readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** the files a surface is written in. */
export const SOURCE = /\.(svelte|ts|js|css|html)$/;

/** a path with the platform's separator replaced by `/`, so a label reads the same everywhere. */
export function toPosix(path: string) {
	return path.split(sep).join('/');
}

/**
 * The scanner for one package's `src/`, handed as the URL of that directory.
 *
 * `SRC_ROOT` is the directory every label is written from. `sourceFiles` answers every file under
 * it whose name matches, labelled from it. A `tests/` directory is left out: it covers these rules
 * rather than obeying them, and a lint test names the very patterns it forbids.
 */
export function sourceTree(root: URL) {
	const SRC_ROOT = fileURLToPath(root);

	function sourceFiles(pattern: RegExp = SOURCE) {
		return readdirSync(SRC_ROOT, { recursive: true, withFileTypes: true })
			.filter((entry) => entry.isFile() && pattern.test(entry.name))
			.map((entry) => {
				const file = join(entry.parentPath, entry.name);
				return { file, label: toPosix(relative(SRC_ROOT, file)) };
			})
			.filter(({ label }) => !label.split('/').includes('tests'));
	}

	return { SRC_ROOT, sourceFiles };
}
