import assert from 'node:assert/strict';
import test from 'node:test';

import { toDetailLines } from './clipboard.ts';

test('a record’s details are one line each, in the order the surface reads them', () => {
	assert.equal(
		toDetailLines([
			{ label: 'name', value: 'Sara' },
			{ label: 'phone', value: '+966551234567' }
		]),
		'name: Sara\nphone: +966551234567'
	);
});

// a record that has no government id should not paste a blank one.
test('a detail with nothing in it is left out rather than written empty', () => {
	assert.equal(
		toDetailLines([
			{ label: 'reference', value: '   ' },
			{ label: 'tenant', value: 'Sara' }
		]),
		'tenant: Sara'
	);
});

test('details that are all empty come back as nothing to write', () => {
	assert.equal(toDetailLines([{ label: 'reference', value: '' }]), '');
	assert.equal(toDetailLines([]), '');
});
