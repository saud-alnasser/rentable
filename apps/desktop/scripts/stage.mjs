import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';

import {
	ISOLATED,
	STAGE_URL,
	findBrowser,
	packageRoot,
	stageServing,
	startStageServer,
	windowSize
} from './stage-browser.mjs';

/**
 * Opens staging: the real interface on mock data, in the desktop window.
 *
 * ```bash
 * pnpm stage:open              # the desktop shell, as the app opens
 * pnpm stage:open --browser    # a Chromium app window instead, with no Rust build
 * ```
 *
 * Starts the dev server in stage mode (`src/lib/prototype/stage/vite.js`), or reuses one already
 * running, and opens it. Closing the window, or Ctrl+C here, ends what this started.
 *
 * **The desktop window is the shell itself**, run by `tauri dev` over `tauri/tauri.stage.conf.json`:
 * the same window, frame and WebView as the app, with no entry code changed and nothing of it in a
 * release build. The shell runs on an identifier of its own, so its data directories, its single
 * instance and its webview storage are not the app's, and registers no link scheme, so the owner's
 * `rentable://` links stay with the app. Every command the interface sends is still answered by the
 * staged host, except the window's own (`host.ts`). Its Rust build goes to `target/stage` in the main
 * checkout, shared by every worktree's stage and apart from the dev build, and its directories are
 * removed when it closes.
 *
 * **The browser window** is a Chromium app window at the desktop window's size on a fresh profile
 * with extensions and sync off ([`ISOLATED`]), removed on exit.
 */

const STAGE_IDENTIFIER = 'com.rentable.stage';
const STAGE_WEBVIEW_PORT = 9232;

const { values } = parseArgs({ options: { browser: { type: 'boolean' } } });

const started = (await stageServing())
	? null
	: startStageServer((chunk) => process.stdout.write(chunk));
const cleanups = [];
let viewer = null;

const end = (code = 0) => {
	viewer?.kill();
	started?.server.kill();
	for (const cleanup of cleanups) cleanup();
	process.exit(code);
};

process.on('SIGINT', () => end());
started?.server.on('exit', (code) => end(code ?? 0));

await started?.ready;

viewer = values.browser ? openBrowser() : openShell();
viewer.on('exit', (code) => end(code ?? 0));

function openShell() {
	cleanups.push(() => {
		for (const directory of stageDirectories()) {
			rmSync(directory, { force: true, recursive: true, maxRetries: 5, retryDelay: 200 });
		}
	});

	const target = mainCheckout();
	const env = {
		...process.env,
		RENTABLE_DEBUG_PORT: process.env.STAGE_DEBUG_PORT ?? String(STAGE_WEBVIEW_PORT),
		...(target
			? { CARGO_TARGET_DIR: join(target, 'apps', 'desktop', 'tauri', 'target', 'stage') }
			: {})
	};

	console.log('stage: opening the desktop window; the first build of the shell takes a while');

	return spawn(
		process.execPath,
		[
			join(packageRoot, 'scripts', 'tauri-with-env.mjs'),
			'dev',
			'--config',
			join('tauri', 'tauri.stage.conf.json')
		],
		{ cwd: packageRoot, env, stdio: 'inherit' }
	);
}

function openBrowser() {
	const browser = findBrowser();

	if (!browser) {
		console.error('stage: no Chromium browser found; set STAGE_BROWSER to one');
		end(1);
	}

	const { width, height } = windowSize();
	const profile = mkdtempSync(join(tmpdir(), 'rentable-stage-'));
	cleanups.push(() =>
		rmSync(profile, { force: true, recursive: true, maxRetries: 5, retryDelay: 200 })
	);

	const debug = process.env.STAGE_DEBUG_PORT
		? [`--remote-debugging-port=${process.env.STAGE_DEBUG_PORT}`]
		: [];
	const opened = spawn(
		browser,
		[
			`--app=${STAGE_URL}`,
			`--user-data-dir=${profile}`,
			`--window-size=${width},${height}`,
			...ISOLATED,
			...debug
		],
		{ stdio: 'ignore' }
	);
	console.log(`stage: opened ${STAGE_URL} in ${browser}`);

	return opened;
}

/** the main checkout this worktree belongs to, where the stage's Rust build is shared. */
function mainCheckout() {
	const { stdout, status } = spawnSync(
		'git',
		['rev-parse', '--path-format=absolute', '--git-common-dir'],
		{ cwd: packageRoot, encoding: 'utf8' }
	);

	return status === 0 ? dirname(stdout.trim()) : null;
}

/** where the shell keeps its files under the stage identifier, on each system Tauri runs on. */
function stageDirectories() {
	const home = homedir();

	if (process.platform === 'win32') {
		return [process.env.APPDATA, process.env.LOCALAPPDATA]
			.filter(Boolean)
			.map((root) => join(root, STAGE_IDENTIFIER));
	}

	if (process.platform === 'darwin') {
		return ['Application Support', 'Caches', 'WebKit'].map((root) =>
			join(home, 'Library', root, STAGE_IDENTIFIER)
		);
	}

	return [
		process.env.XDG_DATA_HOME ?? join(home, '.local', 'share'),
		process.env.XDG_CONFIG_HOME ?? join(home, '.config'),
		process.env.XDG_CACHE_HOME ?? join(home, '.cache')
	].map((root) => join(root, STAGE_IDENTIFIER));
}
