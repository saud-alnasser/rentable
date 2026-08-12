import assert from 'node:assert/strict';
import test from 'node:test';

import { toUndoIntent } from './undo-shortcut.ts';

const held = { ctrlKey: true, metaKey: false, shiftKey: false };

test('ctrl or command with z takes a change back', () => {
	assert.equal(toUndoIntent({ ...held, key: 'z', code: 'KeyZ' }), 'undo');
	assert.equal(
		toUndoIntent({ ...held, ctrlKey: false, metaKey: true, key: 'z', code: 'KeyZ' }),
		'undo'
	);
});

// the arabic layout puts ء on the z key and لا on the y key; matching the physical key is what
// keeps the pair alive in a locale this application treats as first class.
test('an arabic layout reaches both directions', () => {
	assert.equal(toUndoIntent({ ...held, key: 'ء', code: 'KeyZ' }), 'undo');
	assert.equal(toUndoIntent({ ...held, shiftKey: true, key: 'ء', code: 'KeyZ' }), 'redo');
	assert.equal(toUndoIntent({ ...held, key: 'لا', code: 'KeyY' }), 'redo');
});

test('shift reverses the direction, and y asks for it outright', () => {
	assert.equal(toUndoIntent({ ...held, shiftKey: true, key: 'z', code: 'KeyZ' }), 'redo');
	assert.equal(toUndoIntent({ ...held, key: 'y', code: 'KeyY' }), 'redo');
});

test('the key alone is not the shortcut', () => {
	assert.equal(
		toUndoIntent({ ctrlKey: false, metaKey: false, shiftKey: false, key: 'z', code: 'KeyZ' }),
		null
	);
});

test('another key is not the shortcut either', () => {
	assert.equal(toUndoIntent({ ...held, key: 'k', code: 'KeyK' }), null);
});

// where the caret is, ctrl+z means the text editor's own undo and always will.
test('a field that takes typing keeps the shortcut', () => {
	assert.equal(toUndoIntent({ ...held, key: 'z', code: 'KeyZ' }, { tagName: 'INPUT' }), null);
	assert.equal(toUndoIntent({ ...held, key: 'y', code: 'KeyY' }, { tagName: 'TEXTAREA' }), null);
	assert.equal(
		toUndoIntent({ ...held, key: 'z', code: 'KeyZ' }, { tagName: 'DIV', isContentEditable: true }),
		null
	);
});

test('anything else leaves the shortcut to the application', () => {
	assert.equal(toUndoIntent({ ...held, key: 'z', code: 'KeyZ' }, { tagName: 'BUTTON' }), 'undo');
	assert.equal(toUndoIntent({ ...held, key: 'z', code: 'KeyZ' }, null), 'undo');
});
