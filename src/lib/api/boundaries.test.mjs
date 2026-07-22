// Pins the dependency boundaries of the API layer (#101, the contract half of the
// expand-contract): the context is the one way to reach the database, the desktop
// shell, and the clock. Static value imports of those dependencies — and ambient
// clock reads — are forbidden everywhere else, so a regression is a failing test,
// not a review catch.
//
// The TypeScript Drive client bypasses the context seam by design of the programme:
// it is ported to Rust and deleted under #110 and #114-#118, so its files are listed
// as exceptions rather than reworked here.

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const API_ROOT = fileURLToPath(new URL('.', import.meta.url));

const DRIVE_CLIENT = [
	'utils/remote-sync-google-drive.ts',
	'utils/remote-sync-google-drive-autosync.ts',
	'utils/workspace-sync.ts'
];

function apiSourceFiles() {
	return readdirSync(API_ROOT, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
		.map((entry) => relative(API_ROOT, join(entry.parentPath, entry.name)).split(sep).join('/'));
}

// files whose full content matches the pattern, minus the allowed ones. every allowed
// file must still exist — an exception expires with the code it excuses.
function offenders(pattern, allowed) {
	const files = apiSourceFiles();

	for (const file of allowed) {
		assert.ok(files.includes(file), `allowlisted file no longer exists: ${file}`);
	}

	return files.filter(
		(file) => !allowed.includes(file) && pattern.test(readFileSync(join(API_ROOT, file), 'utf8'))
	);
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

	assert.deepEqual(offenders(pattern, ['database/memory.ts']), []);
});

test('the desktop facade is reachable only through the context', () => {
	const pattern = valueImportFrom('\\$lib/api/tauri', '\\./tauri', '(?:\\.\\./)+tauri');

	assert.deepEqual(offenders(pattern, DRIVE_CLIENT), []);
});

test('the tauri runtime is imported only by the facade and the database transport', () => {
	const pattern = valueImportFrom("@tauri-apps/[^']*");

	assert.deepEqual(offenders(pattern, ['tauri.ts', 'database/mod.ts']), []);
});

test('the ambient clock is read only by the context', () => {
	const pattern = /Date\.now\(|new Date\(\)/;

	assert.deepEqual(offenders(pattern, ['context.ts', 'utils/remote-sync-google-drive.ts']), []);
});
