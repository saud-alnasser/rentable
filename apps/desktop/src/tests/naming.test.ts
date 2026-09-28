// Holds every file and directory name in the TypeScript and Svelte trees to
// `rules/module-layout` (effort 840, requirement and criterion 14). The rule is the authority;
// this is its mechanical half, and `tauri/src/naming/` is the Rust one.
//
// What it checks is what the rule's table states and a reader of names alone can decide: no
// module is named `utils` or `common`, as a whole name or as one word of one; no file is
// `mod.ts`; no directory name is a plural but `tests/`. The trees are the application's `src/`
// (its `routes/` aside: those segments are URL paths, not module names) and the design
// package's `src/`.
//
// **The baseline only shrinks.** Today's offenders are `naming.baseline.txt`, sorted, one line
// each. An offender that is not in it fails, and so does a line in it that no longer occurs, so
// a rename deletes its line in the same commit and a new offender cannot be waved through.

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const REPOSITORY = fileURLToPath(new URL('../../../..', import.meta.url));
const TREES = ['apps/desktop/src', 'packages/design/src'];
const SKIPPED = new Set(['apps/desktop/src/routes']);
const BANNED = ['utils', 'common'];
const BASELINE = fileURLToPath(new URL('naming.baseline.txt', import.meta.url));

function label(path: string) {
	return relative(REPOSITORY, path).split(sep).join('/');
}

// the words of a name, its extensions dropped: `chart-utils.ts` is `chart` and `utils`
function words(name: string) {
	return name.split('.')[0].split(/[-_]/);
}

// A word read as a plural by its ending. `-ss`, `-us` and `-is` end singulars (`progress`,
// `status`, `analysis`), so they are not counted.
function plural(name: string) {
	return (
		name !== 'tests' && name.endsWith('s') && !['ss', 'us', 'is'].some((end) => name.endsWith(end))
	);
}

function offences(directory: string, found: Set<string>) {
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const path = join(directory, entry.name);
		const at = label(path);
		if (entry.name.startsWith('.') || entry.name === 'node_modules' || SKIPPED.has(at)) continue;

		if (words(entry.name).some((word) => BANNED.includes(word))) {
			found.add(`${at}${entry.isDirectory() ? '/' : ''}: banned name`);
		}
		if (entry.isDirectory()) {
			if (plural(entry.name)) found.add(`${at}/: plural`);
			offences(path, found);
		} else if (entry.name === 'mod.ts') {
			found.add(`${at}: mod.ts`);
		}
	}
}

function found() {
	const found = new Set<string>();
	for (const tree of TREES) offences(join(REPOSITORY, tree), found);
	return found;
}

function baseline() {
	return readFileSync(BASELINE, 'utf8')
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);
}

test('the baseline is sorted and has no repeats', () => {
	const lines = baseline();
	assert.deepEqual(
		lines,
		[...new Set(lines)].sort(),
		'naming.baseline.txt must be sorted, one line per offence'
	);
});

test('every name follows the module layout rule', () => {
	const now = found();
	const allowed = new Set(baseline());

	assert.deepEqual(
		{
			new: [...now].filter((line) => !allowed.has(line)).sort(),
			gone: [...allowed].filter((line) => !now.has(line)).sort()
		},
		{ new: [], gone: [] },
		'new: rename these (rules/module-layout); gone: delete these lines from src/tests/naming.baseline.txt'
	);
});

test('the checks read names as the rule does', () => {
	assert.deepEqual(words('chart-utils.ts'), ['chart', 'utils']);
	assert.ok(plural('settings') && !plural('tests') && !plural('progress') && !plural('status'));
});
