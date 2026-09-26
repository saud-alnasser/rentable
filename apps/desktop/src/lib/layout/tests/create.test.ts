import assert from 'node:assert/strict';
import test from 'node:test';

import { i18nObject } from '$lib/i18n/i18n-util.ts';
import { loadLocale } from '$lib/i18n/i18n-util.sync.ts';
import { declarePaletteCreates, toOfferedCreates, type PaletteCreate } from '../create.ts';
import { refusalOfEvery, type RecordFlag, type Standing } from '$lib/workspace/permission.ts';
import { EVERY_FLAG, maskOf } from '@rentable/workspace-permission';
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

/*
 * Effort 838, requirement 10 and criterion 10: the create group offers only what the reader may
 * create, by the create flag its procedure names, and an entry that asks for a record first also
 * needs the reader to see the kind it asks for.
 */

/** the subjects offered to a reader holding every flag but these, on a grant of this access. */
function offeredWithout(
	hidden: RecordFlag[],
	accessLevel: Standing['accessLevel'] = 'full-access'
) {
	const standing: Standing = {
		permissions: maskOf(...EVERY_FLAG.filter((flag) => !(hidden as string[]).includes(flag))),
		accessLevel
	};

	return toOfferedCreates(group().creates, (flags) =>
		refusalOfEvery(flags, standing, translations)
	).map((create) => create.subject);
}

test('each entry names the create its procedure asks for', () => {
	const { creates } = group();

	assert.deepEqual(
		creates.map((create) => create.flags[0]),
		['createTenant', 'createComplex', 'createUnit', 'createContract', 'createPayment']
	);
});

test('an entry whose create the reader lacks is not offered, and the others are', () => {
	assert.deepEqual(offeredWithout([]), ['tenant', 'complex', 'unit', 'contract', 'payment']);
	assert.deepEqual(offeredWithout(['createTenant']), ['complex', 'unit', 'contract', 'payment']);
	assert.deepEqual(offeredWithout(['createComplex']), ['tenant', 'unit', 'contract', 'payment']);
	assert.deepEqual(offeredWithout(['createUnit']), ['tenant', 'complex', 'contract', 'payment']);
	assert.deepEqual(offeredWithout(['createContract']), ['tenant', 'complex', 'unit', 'payment']);
	assert.deepEqual(offeredWithout(['createPayment']), ['tenant', 'complex', 'unit', 'contract']);
});

test('a unit or a payment is not offered to a reader who cannot see what it asks for', () => {
	assert.deepEqual(offeredWithout(['viewComplex']), ['tenant', 'complex', 'contract', 'payment']);
	assert.deepEqual(offeredWithout(['viewContract']), ['tenant', 'complex', 'unit', 'contract']);
});

test('on a read-only grant nothing is offered to create', () => {
	assert.deepEqual(offeredWithout([], 'read-only'), []);
});
