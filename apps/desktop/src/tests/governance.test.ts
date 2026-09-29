// Holds every `paths:` glob in `.aep/rules/` and `.aep/contexts/` to the tree (effort 840,
// requirement and criterion 18). A rule or a context loads when a file its globs match is read,
// so a glob that matches nothing turns it off without a word: the directory it named moved, and
// the convention it carried stops reaching the files that moved with it (spec, *Risks*: *A moved
// rule stops loading*).
//
// The tree is what git tracks, not what is on this disk: a generated directory a build leaves
// behind (`tauri/migrations/`, gitignored) would otherwise keep a glob alive on one machine and
// not on another. The frontmatter is read the way `.aep/scripts/validate.mjs` expects it written,
// `paths:` followed by one `  - glob` per line.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { globSync, readFileSync } from 'node:fs';
import { matchesGlob } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const REPOSITORY = fileURLToPath(new URL('../../../..', import.meta.url));
const GOVERNED = ['.aep/rules/*.md', '.aep/contexts/**/*.md'];

/** The `paths:` globs a governed file's frontmatter declares, or none where it declares none. */
function globsOf(text: string): string[] {
	const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? '';
	const globs: string[] = [];
	let listing = false;

	for (const line of frontmatter.split(/\r?\n/)) {
		if (/^paths:\s*$/.test(line)) {
			listing = true;
		} else if (listing && /^\s+-\s+/.test(line)) {
			globs.push(line.replace(/^\s+-\s+/, '').replace(/^(['"])(.*)\1$/, '$2'));
		} else {
			listing = false;
		}
	}

	return globs;
}

function tracked(): string[] {
	return execFileSync('git', ['ls-files'], { cwd: REPOSITORY, encoding: 'utf8' })
		.split('\n')
		.filter(Boolean);
}

function dead(files: readonly string[]): string[] {
	return GOVERNED.flatMap((pattern) => globSync(pattern, { cwd: REPOSITORY }))
		.map((path) => path.split('\\').join('/'))
		.sort()
		.flatMap((path) =>
			globsOf(readFileSync(`${REPOSITORY}/${path}`, 'utf8'))
				.filter((glob) => !files.some((file) => matchesGlob(file, glob)))
				.map((glob) => `${path}: ${glob}`)
		);
}

test('every rule and context glob matches a file in the tree', () => {
	assert.deepEqual(
		dead(tracked()),
		[],
		'a glob matching nothing turns its rule or context off: point it at where its subject lives now'
	);
});

test('the frontmatter is read as the protocol writes it', () => {
	assert.deepEqual(
		globsOf('---\npaths:\n  - apps/desktop/src/**\n  - \'packages/x/**\'\nuse-when: "y"\n---\n'),
		['apps/desktop/src/**', 'packages/x/**']
	);
	assert.deepEqual(globsOf('---\nuse-when: "y"\n---\n# no paths\n'), []);
});

test('a glob naming a directory that moved is dead', () => {
	const files = ['apps/desktop/src/lib/shell/component/frame.svelte'];

	assert.ok(files.some((file) => matchesGlob(file, 'apps/desktop/src/lib/shell/**')));
	assert.ok(!files.some((file) => matchesGlob(file, 'apps/desktop/src/lib/layout/**')));
});
