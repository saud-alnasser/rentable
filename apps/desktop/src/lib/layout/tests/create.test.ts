import assert from 'node:assert/strict';
import test from 'node:test';

import { i18nObject } from '$lib/i18n/i18n-util.ts';
import { loadLocale } from '$lib/i18n/i18n-util.sync.ts';
import { declarePaletteCreates, type PaletteCreate } from '../create.ts';
import type { RecordSubject } from '../palette.ts';

/**
 * THE COMMAND MENU CREATES EVERY CONCEPT
 *
 * Criterion 9(c) of [[efforts/832-the-interface-speaks-one-language-and-guides/spec]]: the command
 * menu creates tenants, complexes, units, contracts and payments. The group is declared against
 * the two hosts it asks directly, so it is read and run here with stand-ins for them.
 */

loadLocale('en');

const translations = i18nObject('en');

/** the create group, with a record of what each host was asked. */
function group() {
	const asked: { host: string; prefill: unknown }[] = [];
	const creates = declarePaletteCreates({
		unit: (prefill) => asked.push({ host: 'unit', prefill }),
		payment: (prefill) => asked.push({ host: 'payment', prefill })
	});

	return { creates, asked };
}

const entry = (creates: PaletteCreate[], subject: RecordSubject) => {
	const found = creates.find((create) => create.subject === subject);

	assert.ok(found, `the group offers ${subject}`);

	return found;
};

test('the create group covers the five concepts, once each, in the order records are searched', () => {
	const { creates } = group();

	assert.deepEqual(
		creates.map((create) => create.subject),
		['tenant', 'complex', 'unit', 'contract', 'payment']
	);
});

test('each entry is named for what it creates, in the reader language', () => {
	const { creates } = group();

	assert.deepEqual(
		creates.map((create) => create.label(translations)),
		['tenant', 'complex', 'unit', 'contract', 'payment']
	);
});

test('a tenant, a complex and a contract are made in their directory, which the host answers', () => {
	const { creates } = group();

	for (const [subject, directory] of [
		['tenant', '/tenants'],
		['complex', '/complexes'],
		['contract', '/contracts']
	] as const) {
		const create = entry(creates, subject);

		assert.equal(create.kind, 'directory', subject);
		assert.equal(create.kind === 'directory' && create.directory, directory, subject);
	}
});

test('a unit asks for its complex, and the unit host is asked with it', () => {
	const { creates, asked } = group();
	const unit = entry(creates, 'unit');

	assert.equal(unit.kind, 'asks');
	assert.equal(unit.kind === 'asks' && unit.asks, 'complex');

	if (unit.kind === 'asks') unit.create('complex-1');

	assert.deepEqual(asked, [{ host: 'unit', prefill: { complexId: 'complex-1' } }]);
});

test('a payment asks for its contract, and the payment host is asked with it', () => {
	const { creates, asked } = group();
	const payment = entry(creates, 'payment');

	assert.equal(payment.kind, 'asks');
	assert.equal(payment.kind === 'asks' && payment.asks, 'contract');

	if (payment.kind === 'asks') payment.create('contract-1');

	assert.deepEqual(asked, [{ host: 'payment', prefill: { contractId: 'contract-1' } }]);
});
