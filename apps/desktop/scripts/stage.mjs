import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	STAGE_URL,
	findBrowser,
	stageServing,
	startStageServer,
	windowSize
} from './stage-browser.mjs';

/**
 * Opens staging: the real interface on mock data, with no Tauri process behind it.
 *
 * ```bash
 * pnpm stage
 * ```
 *
 * Starts the dev server in stage mode (`src/lib/prototype/stage/vite.js`) and opens it in a
 * Chromium app window at the desktop window's size. WebView2 is Chromium, so what is drawn is
 * what the app draws; the browser profile is a fresh temp directory, so nothing of the owner's
 * browser is read and nothing is left behind. Closing the window, or Ctrl+C here, ends both. A
 * stage server already running (another window, `pnpm stage:shots`) is reused and left running.
 */

const browser = findBrowser();

if (!browser) {
	console.error('stage: no Chromium browser found; set STAGE_BROWSER to one');
	process.exit(1);
}

const { width, height } = windowSize();
const profile = mkdtempSync(join(tmpdir(), 'rentable-stage-'));
const started = (await stageServing())
	? null
	: startStageServer((chunk) => process.stdout.write(chunk));

let viewer = null;

const end = (code = 0) => {
	viewer?.kill();
	started?.server.kill();
	rmSync(profile, { force: true, recursive: true, maxRetries: 5, retryDelay: 200 });
	process.exit(code);
};

process.on('SIGINT', () => end());
started?.server.on('exit', (code) => end(code ?? 0));

await started?.ready;

const debug = process.env.STAGE_DEBUG_PORT
	? [`--remote-debugging-port=${process.env.STAGE_DEBUG_PORT}`]
	: [];
viewer = spawn(
	browser,
	[
		`--app=${STAGE_URL}`,
		`--user-data-dir=${profile}`,
		`--window-size=${width},${height}`,
		'--no-first-run',
		'--no-default-browser-check',
		...debug
	],
	{ stdio: 'ignore' }
);
viewer.on('exit', () => end());
console.log(`stage: opened ${STAGE_URL} in ${browser}`);
