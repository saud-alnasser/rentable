import assert from 'node:assert/strict';
import test from 'node:test';

import {
	isEditingText,
	matchesShortcut,
	matchesShortcutKey,
	shortcutsCollide,
	toShortcutHint,
	usesAppleKeyboard
} from '../shortcut.ts';

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

// a key that types nothing reports the same string as both halves, so its own name is the whole
// answer and there is nothing to derive.
test('a named key is matched by the name it reports', () => {
	assert.equal(matchesShortcutKey({ key: 'ArrowDown', code: 'ArrowDown' }, 'ArrowDown'), true);
	assert.equal(matchesShortcutKey({ key: 'Enter', code: 'NumpadEnter' }, 'Enter'), true);
	assert.equal(matchesShortcutKey({ key: 'ArrowUp', code: 'ArrowUp' }, 'ArrowDown'), false);
});

// the layout the application is built for is the case this exists for: an arabic keyboard prints
// something else on the key `/` sits on, and the shortcut is dead there if only the character is
// compared.
test('a punctuation key is matched by the key it sits on as well as the mark it produces', () => {
	assert.equal(matchesShortcutKey({ key: '/', code: 'Slash' }, '/'), true);
	assert.equal(matchesShortcutKey({ key: 'ؤ', code: 'Slash' }, '/'), true);
	assert.equal(matchesShortcutKey({ key: '.', code: 'Period' }, '/'), false);
});

test('a field that takes typing keeps its own editing shortcuts', () => {
	assert.equal(isEditingText({ tagName: 'INPUT' }), true);
	assert.equal(isEditingText({ tagName: 'TEXTAREA' }), true);
});

test('a control that takes typing without being an input says so, and is believed', () => {
	assert.equal(isEditingText({ tagName: 'DIV', isContentEditable: true }), true);
});

test('everything else leaves the shortcut to the application', () => {
	assert.equal(isEditingText({ tagName: 'BUTTON' }), false);
	assert.equal(isEditingText({ tagName: 'DIV', isContentEditable: false }), false);
	assert.equal(isEditingText(null), false);
	assert.equal(isEditingText(undefined), false);
});

const held = { ctrlKey: true, metaKey: false, shiftKey: false };

test('a modifier stated must match', () => {
	assert.equal(
		matchesShortcut({ ...held, key: 'k', code: 'KeyK' }, { key: 'k', command: true }),
		true
	);
	assert.equal(
		matchesShortcut(
			{ ctrlKey: false, metaKey: false, shiftKey: false, key: 'k', code: 'KeyK' },
			{ key: 'k', command: true }
		),
		false
	);
});

test('a modifier stated false must not be held', () => {
	assert.equal(
		matchesShortcut(
			{ ...held, shiftKey: true, key: 'z', code: 'KeyZ' },
			{
				key: 'z',
				command: true,
				shift: false
			}
		),
		false
	);
});

test('a modifier omitted is not consulted, either way', () => {
	assert.equal(
		matchesShortcut({ ...held, key: 'k', code: 'KeyK' }, { key: 'k', command: true }),
		true
	);
	assert.equal(
		matchesShortcut(
			{ ...held, shiftKey: true, key: 'k', code: 'KeyK' },
			{ key: 'k', command: true }
		),
		true
	);
});

test('two combinations one keydown could fire collide', () => {
	assert.equal(shortcutsCollide({ key: 'k', command: true }, { key: 'k', command: true }), true);
});

test('a letter in common is not a collision when a modifier separates them', () => {
	assert.equal(
		shortcutsCollide(
			{ key: 'z', command: true, shift: false },
			{ key: 'z', command: true, shift: true }
		),
		false
	);
});

test('a modifier one of them does not consult overlaps both answers to it', () => {
	assert.equal(
		shortcutsCollide({ key: 'k', command: true }, { key: 'k', command: true, shift: true }),
		true
	);
});

test('different letters never collide', () => {
	assert.equal(shortcutsCollide({ key: 'k', command: true }, { key: 'b', command: true }), false);
});

test('the hint prints what has to be pressed, and nothing that does not', () => {
	assert.equal(toShortcutHint({ key: 'k', command: true }, false), 'Ctrl K');
	assert.equal(toShortcutHint({ key: 'z', command: true, shift: true }, false), 'Ctrl Shift Z');
	assert.equal(toShortcutHint({ key: 'z', command: true, shift: false }, false), 'Ctrl Z');
	assert.equal(toShortcutHint({ key: 'j' }, false), 'J');
});

// upper-casing a key's own name prints ARROWDOWN, which is not on any keyboard.
test('a key with a glyph on it is printed as that glyph, in either locale', () => {
	assert.equal(toShortcutHint({ key: 'ArrowUp' }, false), '↑');
	assert.equal(toShortcutHint({ key: 'ArrowDown' }, false), '↓');
	assert.equal(toShortcutHint({ key: 'ArrowLeft' }, false), '←');
	assert.equal(toShortcutHint({ key: 'ArrowRight' }, false), '→');
	assert.equal(toShortcutHint({ key: 'Enter' }, false), 'Enter');
	assert.equal(toShortcutHint({ key: '/' }, false), '/');
});

test('an apple keyboard prints the symbols it has on it', () => {
	assert.equal(toShortcutHint({ key: 'k', command: true }, true), '⌘ K');
	assert.equal(toShortcutHint({ key: 'z', command: true, shift: true }, true), '⌘ ⇧ Z');
});

// read at the point of use rather than at module load, which is what lets this file be imported
// where there is no navigator at all.
test('the keyboard is described without one being there', () => {
	assert.equal(usesAppleKeyboard(), false);
});
