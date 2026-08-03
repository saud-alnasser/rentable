// Pins the dependency boundaries of the API layer (#101, the contract half of the
// expand-contract): the context is the one way to reach the database, the desktop
// shell, and the clock. Static value imports of those dependencies — and ambient
// clock reads — are forbidden everywhere else, so a regression is a failing test,
// not a review catch.
//
// The layer is no longer one directory. A concept that has relocated (#123-#126) keeps
// its request-time modules — its router, and reconciliation — under its own name, and
// those stay subject to every rule below. The rest of a concept directory is frontend
// and is not the layer: a query module reaches the desktop facade because that is what
// the facade is for. The membership test is the one `.claude/rules/api-layer.md` scopes
// itself by, so a relocation cannot quietly leave the pin behind.
//
// Allowlisted files leave rather than accumulate. Two remote-sync modules were excused
// here while they sat in `api/utils/`; the database transport and the desktop facade
// were excused while they sat in `api/`. All four have moved to the home that owns them
// (#125, #126), so the exceptions dissolved instead of being carried — the layer is
// still checked in full, and what it no longer contains it no longer has to excuse.
//
// That also means the database and the facade are reachable from here by one spelling
// each, the `$lib` one. They are in another home now, so no relative path can name them.

import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const LIB_ROOT = fileURLToPath(new URL('..', import.meta.url));
const API_ROOT = join(LIB_ROOT, 'api');
const REQUEST_TIME_MODULES = ['router.ts', 'reconcile.ts'];

function toPosix(path) {
	return path.split(sep).join('/');
}

function labelled(file) {
	return { file, label: toPosix(relative(LIB_ROOT, file)) };
}

// every source file the layer owns: all of `api/`, plus the request-time modules of each
// concept home beside it. The label is library-relative, because `router.ts` on its own
// now names half a dozen files.
function apiSourceFiles() {
	const inApi = readdirSync(API_ROOT, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
		.map((entry) => labelled(join(entry.parentPath, entry.name)));

	const inConcepts = readdirSync(LIB_ROOT, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && entry.name !== 'api')
		.flatMap((home) =>
			REQUEST_TIME_MODULES.map((name) => join(LIB_ROOT, home.name, name)).filter(existsSync)
		)
		.map(labelled);

	return [...inApi, ...inConcepts];
}

// files whose full content matches the pattern, minus the allowed ones. every allowed
// file must still exist — an exception expires with the code it excuses.
function offenders(pattern, allowed) {
	const files = apiSourceFiles();

	for (const entry of allowed) {
		assert.ok(
			files.some(({ label }) => label === entry),
			`allowlisted file no longer exists: ${entry}`
		);
	}

	return files
		.filter(
			({ file, label }) => !allowed.includes(label) && pattern.test(readFileSync(file, 'utf8'))
		)
		.map(({ label }) => label);
}

// a static value import, re-export, or side-effect import from any of the given module
// paths; `import type` is erased at runtime and stays allowed.
function valueImportFrom(...modulePaths) {
	const from = modulePaths.map((path) => path.replaceAll('/', '\\/')).join('|');

	return new RegExp(
		`(?:import|export)\\s+(?!type\\b)[^;]*?from\\s+'(?:${from})'|import\\s+'(?:${from})'`,
		's'
	);
}

test('the database singleton is reachable only through the context', () => {
	const pattern = valueImportFrom('\\$lib/platform/database/client');

	assert.deepEqual(offenders(pattern, []), []);
});

test('the desktop facade is reachable only through the context', () => {
	const pattern = valueImportFrom('\\$lib/platform/tauri');

	assert.deepEqual(offenders(pattern, []), []);
});

test('the tauri runtime is imported only by the facade and the database transport', () => {
	const pattern = valueImportFrom("@tauri-apps/[^']*");

	assert.deepEqual(offenders(pattern, []), []);
});

test('the ambient clock is read only by the context', () => {
	const pattern = /Date\.now\(|new Date\(\)/;

	assert.deepEqual(offenders(pattern, ['api/context.ts']), []);
});
