import assert from 'node:assert/strict';
import test from 'node:test';

import { matchesShortcutKey } from './shortcut.ts';

test('the character the key produces is matched, so a latin layout still fires', () => {
	assert.equal(matchesShortcutKey({ key: 'b', code: 'KeyB' }, 'b'), true);
});

test('the physical key is matched, so an arabic layout fires too', () => {
	assert.equal(matchesShortcutKey({ key: 'ب', code: 'KeyB' }, 'b'), true);
});

test('a layout that moves the character keeps working, because either half is enough', () => {
	assert.equal(matchesShortcutKey({ key: 'b', code: 'KeyN' }, 'b'), true);
});

test('another key is not the shortcut, under either layout', () => {
	assert.equal(matchesShortcutKey({ key: 'a', code: 'KeyA' }, 'b'), false);
	assert.equal(matchesShortcutKey({ key: 'ش', code: 'KeyA' }, 'b'), false);
});

test('the character asked for decides, so two shortcuts do not answer each other', () => {
	assert.equal(matchesShortcutKey({ key: 'k', code: 'KeyK' }, 'b'), false);
	assert.equal(matchesShortcutKey({ key: 'ب', code: 'KeyB' }, 'k'), false);
});
