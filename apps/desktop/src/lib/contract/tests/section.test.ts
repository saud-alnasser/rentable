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

// ticket 04 of effort 835: the schedule is a section of its own, read after the payments.
test('?section=schedule opens the schedule, which follows the payments', () => {
	assert.equal(contractSectionOf(at('?section=schedule')), 'schedule');
	assert.equal(CONTRACT_SECTIONS.indexOf('schedule'), CONTRACT_SECTIONS.indexOf('payments') + 1);
});

test('a contract address naming no section opens its payments', () => {
	assert.equal(contractSectionOf(at('')), 'payments');
});

test('a section a contract does not have opens its payments rather than nothing', () => {
	assert.equal(contractSectionOf(at('?section=tenants')), 'payments');
});
