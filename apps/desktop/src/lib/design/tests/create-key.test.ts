import assert from 'node:assert/strict';
import test from 'node:test';

import { i18nObject } from '$lib/i18n/i18n-util.ts';
import { loadLocale } from '$lib/i18n/i18n-util.sync.ts';
import { toCreateShortcut, type CreateTarget } from '../create-key.ts';
import { ShortcutRegistry } from '../shortcut-registry.ts';

/**
 * THE CREATE KEY, AS THE REGISTRY ANSWERS IT
 *
 * Criterion 9(b) of [[efforts/832-the-interface-speaks-one-language-and-guides/spec]]: one key
 * creates in the set on screen. Exercised through the registry, as the undo pair is, so what is
 * asserted is what a keydown reaches.
 */

loadLocale('en');

const translations = i18nObject('en');

function screen({ covered = false }: { covered?: boolean } = {}) {
	const created: string[] = [];
	let onScreen: CreateTarget | undefined;
	const registry = new ShortcutRegistry(() => {});
	const key = toCreateShortcut(
		() => onScreen,
		() => covered
	);

	registry.register(key);

	return {
		key,
		created,
		draw: (name: string) => {
			onScreen = { create: () => created.push(name) };
		},
		press: (held: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean }) => {
			for (const shortcut of registry.answering({
				key: 'n',
				code: 'KeyN',
				ctrlKey: false,
				metaKey: false,
				shiftKey: false,
				...held
			})) {
				shortcut.run();
			}
		}
	};
}

test('ctrl or cmd with n reaches the set on screen', () => {
	const { draw, press, created } = screen();

	draw('tenants');
	press({ ctrlKey: true });
	press({ metaKey: true });

	assert.deepEqual(created, ['tenants', 'tenants']);
});

test('n alone is typing, and creates nothing', () => {
	const { draw, press, created } = screen();

	draw('tenants');
	press({});

	assert.deepEqual(created, []);
});

test('with no set on screen the key says why, and runs nothing', () => {
	const { key, press, created } = screen();

	assert.equal(key.unavailable?.(translations), translations.common.ui.nothingToCreateHere());
	press({ ctrlKey: true });
	assert.deepEqual(created, []);
});

test('a set on screen makes it available', () => {
	const { key, draw } = screen();

	draw('contracts');

	assert.equal(key.unavailable?.(translations), undefined);
});

test('a form standing over the set takes the key without opening a second one', () => {
	const { draw, press, created } = screen({ covered: true });

	draw('tenants');
	press({ ctrlKey: true });

	assert.deepEqual(created, []);
});
