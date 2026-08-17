import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Runs the desktop app with its window opened on one route, for looking at a prototype.
 *
 * ```bash
 * pnpm prototype /contracts?create
 * ```
 *
 * The window normally opens on `/` and the route being prototyped is several clicks in,
 * which has to be redone after every reload the Rust watcher triggers. This puts the route
 * in the window's own starting URL instead, so the reload lands back where you were.
 *
 * The route is passed as a config the Tauri CLI merges over `tauri.conf.json` for the one
 * run — the tracked file is never edited, so a prototype session cannot leave a dev URL
 * behind in it.
 */

const [route] = process.argv.slice(2);

if (!route) {
	console.error('usage: pnpm prototype <route>    e.g. pnpm prototype /contracts?create');
	process.exit(1);
}

const packageRoot = join(import.meta.dirname, '..');
const configPath = join(packageRoot, 'tauri', 'tauri.conf.json');
const { build } = JSON.parse(readFileSync(configPath, 'utf8'));

// the base comes out of the tracked config rather than being spelled again here: the dev
// server's port is fixed in two places already, and a third copy is one that goes stale
// silently — the window would open on a port nothing is serving.
const devUrl = new URL(route, build.devUrl).href;
const overrides = mkdtempSync(join(tmpdir(), 'rentable-prototype-'));
const overridePath = join(overrides, 'tauri.conf.json');

writeFileSync(overridePath, JSON.stringify({ build: { devUrl } }));

console.log(`prototype: opening ${devUrl}`);

try {
	const result = spawnSync(
		process.execPath,
		[join(import.meta.dirname, 'tauri-with-env.mjs'), 'dev', '--config', overridePath],
		{ cwd: packageRoot, stdio: 'inherit' }
	);

	if (result.error) {
		throw result.error;
	}

	process.exit(result.status ?? 1);
} finally {
	rmSync(overrides, { force: true, recursive: true });
}
