import assert from 'node:assert/strict';
import test from 'node:test';

import { toDiagnosticFields } from './record.ts';

test('every field reaches the log as text', () => {
	assert.deepEqual(
		toDiagnosticFields({ attempt: 3, manual: true, workspace: 'w_31' }),
		{ attempt: '3', manual: 'true', workspace: 'w_31' },
		'the log holds strings, so a number that arrived as one must not stay one'
	);
});

test('a field with nothing in it is left out rather than written as empty', () => {
	assert.deepEqual(toDiagnosticFields({ account: null, error: undefined, action: 'push' }), {
		action: 'push'
	});
});

test('no fields at all is an empty set, not a thrown error', () => {
	assert.deepEqual(toDiagnosticFields(), {});
	assert.deepEqual(toDiagnosticFields({}), {});
});
