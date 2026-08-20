import assert from 'node:assert/strict';
import test from 'node:test';

import { STACK_LIMIT, toCaughtErrorFields } from '$lib/layout/boundary.ts';
import { toDiagnosticFields } from '$lib/platform/diagnostics.ts';

// --- What a caught error leaves behind -------------------------------------------------

test('the scope says which of the two boundaries caught it', () => {
	assert.equal(toCaughtErrorFields('content', new Error('boom')).scope, 'content');
	assert.equal(toCaughtErrorFields('shell', new Error('boom')).scope, 'shell');
});

test('an error is described by its message', () => {
	assert.equal(
		toCaughtErrorFields('content', new Error('cannot read length')).detail,
		'cannot read length'
	);
});

test('and a bare string thrown instead of an error is described by itself', () => {
	assert.equal(toCaughtErrorFields('content', 'nope').detail, 'nope');
});

test('and a value carrying nothing readable is left without a description', () => {
	const fields = toCaughtErrorFields('content', { code: 7 });

	assert.equal(fields.detail, undefined);
	// the sink drops what was never measured rather than writing it as empty.
	assert.deepEqual(toDiagnosticFields(fields), { scope: 'content' });
});

test('the stack comes with it, so a reader can find the component that threw', () => {
	const error = new Error('boom');
	error.stack = 'Error: boom\n    at Directory (directory.svelte:12:3)';

	assert.equal(toCaughtErrorFields('content', error).stack, error.stack);
});

test('and a stack longer than the file should carry is cut, and says it was cut', () => {
	const error = new Error('boom');
	error.stack = `Error: boom\n${'    at Frame (frame.svelte:1:1)\n'.repeat(200)}`;

	const { stack } = toCaughtErrorFields('content', error);

	assert.ok(typeof stack === 'string');
	assert.equal(stack.length, STACK_LIMIT + 1, 'the limit, plus the marker saying it was cut');
	assert.ok(stack.endsWith('…'));
	assert.ok(stack.startsWith('Error: boom'), 'cut from the end, so the first frames survive');
});

test('and a thrown value with no stack at all leaves that field out', () => {
	assert.equal(toCaughtErrorFields('shell', 'nope').stack, undefined);
	assert.deepEqual(toDiagnosticFields(toCaughtErrorFields('shell', 'nope')), {
		scope: 'shell',
		detail: 'nope'
	});
});
