import assert from 'node:assert/strict';
import test from 'node:test';
import { get } from 'svelte/store';

import {
	createAppearance,
	resolveAppearance,
	toAppearanceSetting,
	type AppearanceMedia,
	type AppearanceRoot
} from '../appearance.ts';

/** `<html>` as far as the appearance writes to it: which classes it carries, and its scheme. */
function fakeRoot() {
	const classes = new Set<string>();
	const root: AppearanceRoot & { classes: Set<string> } = {
		classes,
		classList: {
			toggle(token, force) {
				if (force ?? !classes.has(token)) classes.add(token);
				else classes.delete(token);
			}
		},
		style: { colorScheme: '' }
	};

	return root;
}

/** the system's `prefers-color-scheme: dark`, which a test turns on and off. */
function fakeSystem(prefersDark: boolean) {
	const listeners = new Set<() => void>();
	let matches = prefersDark;
	const media: AppearanceMedia & { set(dark: boolean): void; listeners: Set<() => void> } = {
		get matches() {
			return matches;
		},
		listeners,
		addEventListener: (_type, listener) => void listeners.add(listener),
		removeEventListener: (_type, listener) => void listeners.delete(listener),
		set(dark) {
			matches = dark;

			for (const listener of listeners) listener();
		}
	};

	return media;
}

test('each setting resolves: system by the system, light and dark by themselves', () => {
	assert.equal(resolveAppearance('system', true), 'dark');
	assert.equal(resolveAppearance('system', false), 'light');
	assert.equal(resolveAppearance('light', true), 'light');
	assert.equal(resolveAppearance('light', false), 'light');
	assert.equal(resolveAppearance('dark', true), 'dark');
	assert.equal(resolveAppearance('dark', false), 'dark');
});

// an older settings file carries no appearance, and nothing else stored there should pin one.
test('a stored value nobody recognises reads as system', () => {
	assert.equal(toAppearanceSetting('light'), 'light');
	assert.equal(toAppearanceSetting('dark'), 'dark');
	assert.equal(toAppearanceSetting('system'), 'system');
	assert.equal(toAppearanceSetting(undefined), 'system');
	assert.equal(toAppearanceSetting(null), 'system');
	assert.equal(toAppearanceSetting('sepia'), 'system');
});

test('before anything is applied it already follows the system, and draws it', () => {
	const root = fakeRoot();
	const appearance = createAppearance(root, fakeSystem(true));

	assert.equal(appearance.setting, 'system');
	assert.ok(root.classes.has('dark'));
	assert.equal(root.style.colorScheme, 'dark');
	assert.equal(get(appearance.resolved), 'dark');
});

test('light and dark set the class and the scheme on the root, whatever the system says', () => {
	const root = fakeRoot();
	const appearance = createAppearance(root, fakeSystem(true));

	appearance.apply('light');
	assert.equal(root.classes.has('dark'), false);
	assert.equal(root.style.colorScheme, 'light');
	assert.equal(get(appearance.resolved), 'light');

	appearance.apply('dark');
	assert.ok(root.classes.has('dark'));
	assert.equal(root.style.colorScheme, 'dark');
	assert.equal(get(appearance.resolved), 'dark');
});

test('under system, a change of the system is drawn at once, with no relaunch', () => {
	const root = fakeRoot();
	const system = fakeSystem(false);
	const appearance = createAppearance(root, system);
	const seen: string[] = [];
	const stop = appearance.resolved.subscribe((value) => seen.push(value));

	appearance.apply('system');
	assert.equal(root.classes.has('dark'), false);

	system.set(true);
	assert.ok(root.classes.has('dark'));
	assert.equal(root.style.colorScheme, 'dark');

	system.set(false);
	assert.equal(root.classes.has('dark'), false);
	assert.equal(root.style.colorScheme, 'light');

	assert.deepEqual(seen.slice(-2), ['dark', 'light']);
	stop();
});

test('a pinned appearance does not move when the system does', () => {
	const root = fakeRoot();
	const system = fakeSystem(false);
	const appearance = createAppearance(root, system);

	appearance.apply('light');
	system.set(true);

	assert.equal(root.classes.has('dark'), false);
	assert.equal(get(appearance.resolved), 'light');

	// and going back to system picks up where the system is now.
	appearance.apply('system');
	assert.ok(root.classes.has('dark'));
});

test('disposing stops following the system', () => {
	const system = fakeSystem(false);
	const appearance = createAppearance(fakeRoot(), system);

	assert.equal(system.listeners.size, 1);
	appearance.dispose();
	assert.equal(system.listeners.size, 0);
});

test('with no media query to read, system draws light', () => {
	const root = fakeRoot();
	createAppearance(root, null);

	assert.equal(root.classes.has('dark'), false);
	assert.equal(root.style.colorScheme, 'light');
});
