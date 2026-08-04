import assert from 'node:assert/strict';
import test from 'node:test';

import { CREATE_INTENT_PARAM, hasCreateIntent, withCreateIntent } from './create-intent.ts';

test('a list path carries the intent as a bare search parameter', () => {
	assert.equal(withCreateIntent('/tenants'), `/tenants?${CREATE_INTENT_PARAM}`);
});

test('the intent is read whether or not the parameter was given a value', () => {
	assert.equal(hasCreateIntent(new URL('http://localhost/tenants?create')), true);
	assert.equal(hasCreateIntent(new URL('http://localhost/tenants?create=')), true);
});

test('a list reached without the intent is left alone', () => {
	assert.equal(hasCreateIntent(new URL('http://localhost/tenants')), false);
	assert.equal(hasCreateIntent(new URL('http://localhost/tenants?section=units')), false);
});
