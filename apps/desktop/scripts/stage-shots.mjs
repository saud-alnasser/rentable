import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import {
	STAGE_PORT,
	STAGE_URL,
	findBrowser,
	packageRoot,
	stageServing,
	startStageServer,
	windowSize
} from './stage-browser.mjs';

/**
 * Enters staged states as the owner will, in both languages and both appearances, and keeps a
 * screenshot of each, so they are looked at before the owner is handed the window.
 *
 * ```bash
 * pnpm stage:shots              # every state
 * pnpm stage:shots 861.         # the states whose id starts with `861.`
 * pnpm stage:shots 861. --out <dir>
 * ```
 *
 * Reuses a stage server already running, or starts one and stops it after. Each shot is a fresh
 * headless browser context, so no selection or record carries from one into the next; a state's
 * `owner` act (a key, a pointer) is done through the browser's own input, which the page cannot
 * tell from a person's. Shots land in `.aep/scratch/stage/` unless `--out` says otherwise, named
 * `<id>-<language>-<appearance>.png`.
 *
 * It fails when a state stops short of its screen, the page throws, or the window asks any host
 * but the stage server: each would make the shot something other than what the owner will see.
 */

const LANGUAGES = ['en', 'ar'];
const APPEARANCES = ['light', 'dark'];
const KEYS = { Escape: 27, Enter: 13, Tab: 9, ' ': 32 };
const REACH_TIMEOUT = 45_000;

const { values, positionals } = parseArgs({
	allowPositionals: true,
	options: { out: { type: 'string' } }
});
const out = resolve(values.out ?? join(packageRoot, '..', '..', '.aep', 'scratch', 'stage'));
const browser = findBrowser();

if (!browser) {
	console.error('stage: no Chromium browser found; set STAGE_BROWSER to one');
	process.exit(1);
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

const started = (await stageServing()) ? null : startStageServer();
await started?.ready;

const { width, height } = windowSize();
const profile = mkdtempSync(join(tmpdir(), 'rentable-stage-shots-'));
const chromium = spawn(
	browser,
	[
		'--headless=new',
		'--remote-debugging-port=0',
		`--user-data-dir=${profile}`,
		`--window-size=${width},${height}`,
		'--hide-scrollbars',
		'--no-first-run',
		'about:blank'
	],
	{ stdio: 'ignore' }
);

const end = async (code) => {
	cdp?.close();
	chromium.kill();
	started?.server.kill();
	await sleep(500);
	rmSync(profile, { force: true, recursive: true, maxRetries: 5, retryDelay: 200 });
	process.exit(code);
};

let cdp = null;

try {
	cdp = await connect(profile);
	mkdirSync(out, { recursive: true });

	const states = await listStates();
	const chosen = states.filter(
		({ id }) => positionals.length === 0 || positionals.some((prefix) => id.startsWith(prefix))
	);

	if (chosen.length === 0) {
		console.error(`stage: no state's id starts with ${positionals.join(' or ')}`);
		await end(1);
	}

	let faults = 0;

	for (const state of chosen) {
		for (const language of LANGUAGES) {
			for (const appearance of APPEARANCES) {
				const shot = await take(state, language, appearance);
				const name = `${state.id}-${language}-${appearance}`;
				const file = join(out, `${name}.png`);
				writeFileSync(file, shot.png);

				const problems = [
					shot.status === 'reached'
						? null
						: `${shot.status}${shot.failure ? `: ${shot.failure}` : ''}`,
					...shot.hosts.map((host) => `asked ${host}`),
					...shot.errors
				].filter(Boolean);
				faults += problems.length;

				console.log(
					`${problems.length ? 'FAIL' : 'ok  '} ${name}${problems.length ? `  ${problems.join('; ')}` : ''}`
				);
			}
		}
	}

	console.log(`stage: ${chosen.length * 4} shots in ${relative(process.cwd(), out) || '.'}`);
	await end(faults ? 1 : 0);
} catch (error) {
	console.error(error);
	await end(1);
}

/** the states the stage holds, read from a page of it. */
async function listStates() {
	const page = await open();

	try {
		await page.send('Page.navigate', { url: STAGE_URL });
		await until(page, `!!window.stage?.states`, REACH_TIMEOUT);

		return await page.evaluate(`window.stage.states`);
	} finally {
		await page.close();
	}
}

/** one state in one language and appearance, entered from nothing. */
async function take(state, language, appearance) {
	const page = await open();
	const hosts = new Set();
	const errors = [];

	page.on('Network.requestWillBeSent', ({ request }) => {
		const url = new URL(request.url);
		if (/^https?:$/.test(url.protocol) && url.host !== `localhost:${STAGE_PORT}`)
			hosts.add(url.host);
	});
	page.on('Runtime.exceptionThrown', ({ exceptionDetails }) => {
		errors.push(`threw ${exceptionDetails.exception?.description ?? exceptionDetails.text}`);
	});

	try {
		const selection = JSON.stringify({ state: state.id, language, appearance });
		await page.send('Page.addScriptToEvaluateOnNewDocument', {
			source: `localStorage.setItem('stage', ${JSON.stringify(selection)});`
		});
		await page.send('Page.navigate', { url: STAGE_URL });

		const bar = `document.querySelector('[aria-label="stage"]')`;
		await until(
			page,
			`['reached', 'failed'].includes(${bar}?.dataset.status)`,
			REACH_TIMEOUT
		).catch(() => {});
		const status = (await page.evaluate(`${bar}?.dataset.status`)) ?? 'not booted';
		const failure =
			status === 'failed' ? await page.evaluate(`${bar}.querySelector('p')?.innerText`) : null;

		if (status === 'reached') await act(page, state.owner);
		await sleep(900);

		const { data } = await page.send('Page.captureScreenshot', { format: 'png' });

		return { png: Buffer.from(data, 'base64'), status, failure, hosts: [...hosts], errors };
	} finally {
		await page.close();
	}
}

/** what the state leaves to the owner, done through the browser's input. */
async function act(page, owner) {
	if (owner?.hover) {
		const box = await page.evaluate(
			`(() => { const r = document.querySelector(${JSON.stringify(owner.hover)})?.getBoundingClientRect(); return r && { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`
		);
		if (box) await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...box });
	}

	if (owner?.press) {
		const code = KEYS[owner.press];
		for (const type of ['keyDown', 'keyUp']) {
			await page.send('Input.dispatchKeyEvent', {
				type,
				key: owner.press,
				code: owner.press,
				...(code ? { windowsVirtualKeyCode: code } : {})
			});
		}
	}
}

/** waits for an expression to hold on the page. */
async function until(page, expression, timeout) {
	const stop = Date.now() + timeout;

	while (Date.now() < stop) {
		if (await page.evaluate(expression).catch(() => false)) return;
		await sleep(250);
	}

	throw new Error(`stage: ${expression} did not hold within ${timeout}ms`);
}

/** a fresh page in a context of its own, at the window's size. */
async function open() {
	const { browserContextId } = await cdp.send('Target.createBrowserContext');
	const { targetId } = await cdp.send('Target.createTarget', {
		url: 'about:blank',
		browserContextId
	});
	const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
	const send = (method, params = {}) => cdp.send(method, params, sessionId);

	await send('Page.enable');
	await send('Runtime.enable');
	await send('Network.enable');
	await send('Emulation.setDeviceMetricsOverride', {
		width,
		height,
		deviceScaleFactor: 1,
		mobile: false
	});

	return {
		send,
		on: (method, listener) => cdp.listen(sessionId, method, listener),
		evaluate: async (expression) => {
			const { result, exceptionDetails } = await send('Runtime.evaluate', {
				expression,
				returnByValue: true,
				awaitPromise: true
			});
			if (exceptionDetails) throw new Error(exceptionDetails.text);
			return result.value;
		},
		close: () => cdp.send('Target.disposeBrowserContext', { browserContextId })
	};
}

/** the browser's DevTools socket, from the port Chromium chose and wrote to its profile. */
async function connect(profile) {
	const file = join(profile, 'DevToolsActivePort');
	const stop = Date.now() + 15_000;

	while (!existsSync(file) && Date.now() < stop) await sleep(100);

	const [port, path] = readFileSync(file, 'utf8').split('\n');
	const socket = new WebSocket(`ws://127.0.0.1:${port}${path}`);
	await new Promise((done, fail) => {
		socket.addEventListener('open', done);
		socket.addEventListener('error', fail);
	});

	let id = 0;
	const pending = new Map();
	const listeners = [];

	socket.addEventListener('message', ({ data }) => {
		const message = JSON.parse(data);

		if (message.id && pending.has(message.id)) {
			const { done, fail } = pending.get(message.id);
			pending.delete(message.id);
			if (message.error) fail(new Error(`${message.error.message}`));
			else done(message.result);
			return;
		}

		for (const listener of listeners) {
			if (listener.sessionId === message.sessionId && listener.method === message.method) {
				listener.callback(message.params);
			}
		}
	});

	return {
		send: (method, params = {}, sessionId) =>
			new Promise((done, fail) => {
				const next = ++id;
				pending.set(next, { done, fail });
				socket.send(JSON.stringify({ id: next, method, params, sessionId }));
			}),
		listen: (sessionId, method, callback) => listeners.push({ sessionId, method, callback }),
		close: () => socket.close()
	};
}
