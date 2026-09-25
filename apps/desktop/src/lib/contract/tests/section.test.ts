import assert from 'node:assert/strict';
import test from 'node:test';

import { CONTRACT_SECTIONS, contractSectionOf } from '../section.ts';

const at = (search: string) => new URL(`http://localhost/contracts/42${search}`);

// criterion 14 of effort 832: every section of a contract is addressable, its history included.
test('every section a contract has opens from its own address', () => {
	for (const section of CONTRACT_SECTIONS) {
		assert.equal(contractSectionOf(at(`?section=${section}`)), section);
	}
});

test('?section=history opens the history', () => {
	assert.equal(contractSectionOf(at('?section=history')), 'history');
});

test('a contract address naming no section opens its payments', () => {
	assert.equal(contractSectionOf(at('')), 'payments');
});

test('a section a contract does not have opens its payments rather than nothing', () => {
	assert.equal(contractSectionOf(at('?section=tenants')), 'payments');
});
