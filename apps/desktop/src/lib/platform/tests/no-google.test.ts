import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * NO GOOGLE OAUTH CLIENT RETURNS
 *
 * Requirement 19 of [[efforts/819-an-organization-hosts-its-own-workspaces/spec]]: Google sign-in
 * is gone from every build, and with it the client id, the secret and the scopes that shipped in
 * each one. A build that carries an OAuth client it does not use is a credential in every
 * installer for no reason, so this reads the tree rather than trusting that nobody reached for
 * the old environment names again.
 *
 * What is looked for is the client, not the word: the environment names the client shipped
 * under, Google's authorization host, and Google's scope URLs. A test that mentions Google as an
 * example of a server's behaviour is not a client, and the protocol tests under `sync/oauth/`
 * do.
 */

const FORBIDDEN = [
	'GOOGLE_OAUTH_CLIENT_ID',
	'GOOGLE_OAUTH_CLIENT_SECRET',
	'accounts.google.com/o/oauth2',
	'googleapis.com/auth/',
	'rentable.google-drive'
];

const here = fileURLToPath(import.meta.url);
const desktop = join(here, '..', '..', '..', '..', '..');
const repository = join(desktop, '..', '..');

const ROOTS = [
	join(desktop, 'src'),
	join(desktop, 'tauri', 'src'),
	join(desktop, 'tauri', 'Cargo.toml'),
	join(desktop, 'tauri', 'tauri.conf.json'),
	join(desktop, '.env.example'),
	join(desktop, 'package.json'),
	join(repository, 'packages'),
	join(repository, '.github')
];

const SKIP = new Set(['node_modules', 'target', 'gen', 'build', '.svelte-kit']);
const TEXT = /\.(ts|js|mjs|svelte|rs|toml|json|yml|yaml|md|example)$/;

async function* files(root: string): AsyncGenerator<string> {
	const entries = await readdir(root, { withFileTypes: true }).catch(() => null);

	if (!entries) {
		yield root;

		return;
	}

	for (const entry of entries) {
		if (SKIP.has(entry.name)) continue;

		const path = join(root, entry.name);

		if (entry.isDirectory()) {
			yield* files(path);
		} else if (TEXT.test(entry.name) || entry.name === '.env.example') {
			yield path;
		}
	}
}

test('no google oauth client id, secret or scope is in the tree', async () => {
	const offenders: string[] = [];

	for (const root of ROOTS) {
		for await (const path of files(root)) {
			if (path === here) continue;

			const text = await readFile(path, 'utf8');

			for (const needle of FORBIDDEN) {
				if (text.includes(needle)) {
					offenders.push(`${relative(repository, path).split(sep).join('/')}: ${needle}`);
				}
			}
		}
	}

	assert.deepEqual(offenders, [], 'a google oauth client came back');
});
