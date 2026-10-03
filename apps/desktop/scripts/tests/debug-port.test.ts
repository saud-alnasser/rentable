import assert from 'node:assert/strict';
import { test } from 'node:test';

import { debugPort, launchEnvironment } from '../debug-port.mjs';

/**
 * Ticket 54 of effort 846, criterion 2: `tauri-with-env.mjs` opens the webview's debugging port
 * for `dev` on Windows, which is what the organization seed reaches the app through, and never
 * for `build`, so no shipped build carries it.
 */

test('dev on Windows opens the debugging port', () => {
	const env = launchEnvironment(['dev'], 'win32', {});

	assert.equal(env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS, '--remote-debugging-port=9222');
});

test('build never opens it, on any platform', () => {
	for (const platform of ['win32', 'darwin', 'linux'] as const) {
		const env = launchEnvironment(['build'], platform, {});

		assert.equal(env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS, undefined);
	}
});

test('dev elsewhere leaves the environment alone, since no other webview reads it', () => {
	const given = { PATH: '/usr/bin' };

	assert.equal(launchEnvironment(['dev'], 'darwin', given), given);
	assert.equal(launchEnvironment(['dev'], 'linux', given), given);
});

test('the port follows RENTABLE_DEBUG_PORT, and the seed reads the same one', () => {
	const env = launchEnvironment(['dev'], 'win32', { RENTABLE_DEBUG_PORT: '9333' });

	assert.equal(env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS, '--remote-debugging-port=9333');
	assert.equal(debugPort({ RENTABLE_DEBUG_PORT: '9333' }), 9333);
	assert.equal(debugPort({ RENTABLE_DEBUG_PORT: 'nonsense' }), 9222);
});

test('webview arguments already given are kept, and a port already named is not doubled', () => {
	assert.equal(
		launchEnvironment(['dev'], 'win32', { WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--lang=ar' })
			.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS,
		'--lang=ar --remote-debugging-port=9222'
	);
	assert.equal(
		launchEnvironment(['dev'], 'win32', {
			WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=9500'
		}).WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS,
		'--remote-debugging-port=9500'
	);
});
