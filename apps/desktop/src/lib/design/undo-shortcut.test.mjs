import assert from 'node:assert/strict';
import test from 'node:test';

import { ShortcutRegistry } from './shortcut-registry.ts';
import { toUndoShortcuts } from './undo-shortcut.ts';

/**
 * The undo pair, registered, and what a keydown moves the stack by.
 *
 * Exercised through the registry rather than against the registrations directly: what a keydown
 * reaches is the registry's decision now, and asserting on the declaration alone would pass over
 * a matcher that had stopped answering.
 */
function openStack() {
	const applied = [];
	const registry = new ShortcutRegistry(() => {});

	for (const registration of toUndoShortcuts((intent) => applied.push(intent))) {
		registry.register(registration);
	}

	return {
		applied,
		press: (event, target) => {
			for (const shortcut of registry.answering(event, target)) {
				shortcut.run();
			}

			return applied.at(-1) ?? null;
		}
	};
}

const held = { ctrlKey: true, metaKey: false, shiftKey: false };

test('ctrl or command with z takes a change back', () => {
	assert.equal(openStack().press({ ...held, key: 'z', code: 'KeyZ' }), 'undo');
	assert.equal(
		openStack().press({ ...held, ctrlKey: false, metaKey: true, key: 'z', code: 'KeyZ' }),
		'undo'
	);
});

// the arabic layout puts ء on the z key and لا on the y key; matching the physical key is what
// keeps the pair alive in a locale this application treats as first class.
test('an arabic layout reaches both directions', () => {
	assert.equal(openStack().press({ ...held, key: 'ء', code: 'KeyZ' }), 'undo');
	assert.equal(openStack().press({ ...held, shiftKey: true, key: 'ء', code: 'KeyZ' }), 'redo');
	assert.equal(openStack().press({ ...held, key: 'لا', code: 'KeyY' }), 'redo');
});

test('shift reverses the direction, and y asks for it outright', () => {
	assert.equal(openStack().press({ ...held, shiftKey: true, key: 'z', code: 'KeyZ' }), 'redo');
	assert.equal(openStack().press({ ...held, key: 'y', code: 'KeyY' }), 'redo');
});

// shift is what tells the two apart, so one press must never move the stack both ways.
test('one press moves the stack once', () => {
	const stack = openStack();

	stack.press({ ...held, shiftKey: true, key: 'z', code: 'KeyZ' });

	assert.deepEqual(stack.applied, ['redo']);
});

test('the key alone is not the shortcut', () => {
	assert.equal(
		openStack().press({ ctrlKey: false, metaKey: false, shiftKey: false, key: 'z', code: 'KeyZ' }),
		null
	);
});

test('another key is not the shortcut either', () => {
	assert.equal(openStack().press({ ...held, key: 'k', code: 'KeyK' }), null);
});

// where the caret is, ctrl+z means the text editor's own undo and always will.
test('a field that takes typing keeps the shortcut', () => {
	assert.equal(openStack().press({ ...held, key: 'z', code: 'KeyZ' }, { tagName: 'INPUT' }), null);
	assert.equal(
		openStack().press({ ...held, key: 'y', code: 'KeyY' }, { tagName: 'TEXTAREA' }),
		null
	);
	assert.equal(
		openStack().press(
			{ ...held, key: 'z', code: 'KeyZ' },
			{ tagName: 'DIV', isContentEditable: true }
		),
		null
	);
});

test('anything else leaves the shortcut to the application', () => {
	assert.equal(
		openStack().press({ ...held, key: 'z', code: 'KeyZ' }, { tagName: 'BUTTON' }),
		'undo'
	);
	assert.equal(openStack().press({ ...held, key: 'z', code: 'KeyZ' }, null), 'undo');
});

test('the pair names both directions for the sheet', () => {
	assert.deepEqual(
		toUndoShortcuts(() => {}).map((registration) =>
			registration.describe({ common: { undo: { undo: () => 'undo', redo: () => 'redo' } } })
		),
		['undo', 'redo']
	);
});
