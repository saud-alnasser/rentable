import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * What opening staging and photographing it share: the stage server, its address, the Chromium
 * browser it is drawn in, and the desktop window's size. See `./stage.mjs` and `./stage-shots.mjs`.
 */

export const STAGE_PORT = 1430;
export const STAGE_URL = `http://localhost:${STAGE_PORT}/`;

export const packageRoot = join(import.meta.dirname, '..');

const BROWSERS = [
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
	'/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
	'/usr/bin/google-chrome',
	'/usr/bin/chromium'
];

/**
 * What keeps the owner's browser out of the window. A fresh profile alone does not: Edge signs it
 * in to the Windows account and syncs that account's extensions into it, and a dark mode one
 * repaints the interface. It still signs in, but with sync off nothing of the account comes in,
 * and with no extension what is drawn is what the app draws.
 */
export const ISOLATED = [
	'--disable-extensions',
	'--disable-sync',
	'--no-first-run',
	'--no-default-browser-check'
];

/** a Chromium browser on this machine, `STAGE_BROWSER` where set; WebView2 is Chromium. */
export function findBrowser(env = process.env) {
	return env.STAGE_BROWSER ?? BROWSERS.find((path) => existsSync(path));
}

/** the desktop window's size, read from the Tauri config so staging is drawn at it. */
export function windowSize() {
	const { app } = JSON.parse(readFileSync(join(packageRoot, 'tauri', 'tauri.conf.json'), 'utf8'));
	const [{ width, height }] = app.windows;

	return { width, height };
}

/** whether a stage server already answers, so a second run reuses it rather than failing. */
export async function stageServing() {
	try {
		return (await fetch(STAGE_URL, { signal: AbortSignal.timeout(2_000) })).ok;
	} catch {
		return false;
	}
}

/**
 * Starts `vite dev --mode stage` and resolves once it listens.
 *
 * @param {(chunk: string) => void} [echo] what to do with the server's output
 */
export function startStageServer(echo = () => {}) {
	const vite = join(packageRoot, 'node_modules', 'vite', 'bin', 'vite.js');
	const server = spawn(process.execPath, [vite, 'dev', '--mode', 'stage'], {
		cwd: packageRoot,
		stdio: ['ignore', 'pipe', 'inherit']
	});

	const ready = new Promise((resolve, reject) => {
		server.on('exit', (code) => reject(new Error(`stage: the server exited (${code})`)));
		server.stdout.on('data', (chunk) => {
			echo(String(chunk));
			if (String(chunk).includes(String(STAGE_PORT))) resolve(server);
		});
	});

	return { server, ready };
}
