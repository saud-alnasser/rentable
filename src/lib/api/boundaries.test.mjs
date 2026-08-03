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
// The two remote-sync modules that used to be allowlisted here needed the exception
// only because they sat in `api/utils/`. They are the sync concept's now, beside the
// link and conflict modules that always called the facade, so the exception went with
// them rather than being carried.

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
	// `./mod` is the spelling used from inside `database/`; `memory.ts` is allowed in —
	// it imports the shared transport factory, not the singleton.
	const pattern = valueImportFrom(
		'\\$lib/api/database/mod',
		'(?:\\.\\./)+database/mod',
		'\\./database/mod',
		'\\./mod'
	);

	assert.deepEqual(offenders(pattern, ['api/database/memory.ts']), []);
});

test('the desktop facade is reachable only through the context', () => {
	const pattern = valueImportFrom('\\$lib/api/tauri', '\\./tauri', '(?:\\.\\./)+tauri');

	assert.deepEqual(offenders(pattern, []), []);
});

test('the tauri runtime is imported only by the facade and the database transport', () => {
	const pattern = valueImportFrom("@tauri-apps/[^']*");

	assert.deepEqual(offenders(pattern, ['api/tauri.ts', 'api/database/mod.ts']), []);
});

test('the ambient clock is read only by the context', () => {
	const pattern = /Date\.now\(|new Date\(\)/;

	assert.deepEqual(offenders(pattern, ['api/context.ts']), []);
});
