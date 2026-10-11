import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
 * browser is read and nothing is left behind. Closing the window, or Ctrl+C here, ends both.
 */

const packageRoot = join(import.meta.dirname, '..');
const { app } = JSON.parse(readFileSync(join(packageRoot, 'tauri', 'tauri.conf.json'), 'utf8'));
const [{ width, height }] = app.windows;
const url = 'http://localhost:1430/';

const BROWSERS = [
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
	'/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
	'/usr/bin/google-chrome',
	'/usr/bin/chromium'
];
const browser = process.env.STAGE_BROWSER ?? BROWSERS.find((path) => existsSync(path));

if (!browser) {
	console.error('stage: no Chromium browser found; set STAGE_BROWSER to one');
	process.exit(1);
}

const profile = mkdtempSync(join(tmpdir(), 'rentable-stage-'));
const vite = join(packageRoot, 'node_modules', 'vite', 'bin', 'vite.js');
const server = spawn(process.execPath, [vite, 'dev', '--mode', 'stage'], {
	cwd: packageRoot,
	stdio: ['ignore', 'pipe', 'inherit']
});

let viewer = null;

const end = (code = 0) => {
	viewer?.kill();
	server.kill();
	rmSync(profile, { force: true, recursive: true, maxRetries: 5, retryDelay: 200 });
	process.exit(code);
};

process.on('SIGINT', () => end());
server.on('exit', (code) => end(code ?? 0));

server.stdout.on('data', (chunk) => {
	process.stdout.write(chunk);

	if (viewer || !String(chunk).includes('1430')) return;

	const debug = process.env.STAGE_DEBUG_PORT
		? [`--remote-debugging-port=${process.env.STAGE_DEBUG_PORT}`]
		: [];
	viewer = spawn(
		browser,
		[
			`--app=${url}`,
			`--user-data-dir=${profile}`,
			`--viewer-size=${width},${height}`,
			'--no-first-run',
			'--no-default-browser-check',
			...debug
		],
		{ stdio: 'ignore' }
	);
	viewer.on('exit', () => end());
	console.log(`stage: opened ${url} in ${browser}`);
});
