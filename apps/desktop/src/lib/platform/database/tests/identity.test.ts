import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createApi, monthsFromNow, seedTenant } from '$lib/api/tests/testing.ts';
import { isRecordId, newId } from '../identity.ts';

// IDENTITY
//
// A record's identity has to be the record's own, not a position in a sequence. Two workspaces
// that have never met will each create records, and one day those records end up in the same
// place — that is what requirement 16 is for. Every assertion here is about two databases that
// share no state.

test('two records created with no shared state take different identities', async () => {
	const [one, two] = await Promise.all([createApi(), createApi()]);

	const [here, there] = await Promise.all([seedTenant(one), seedTenant(two)]);

	assert.notEqual(
		here.id,
		there.id,
		'two workspaces that have never met should not mint the same identity'
	);
});

/**
 * One record of every concept the schema carries, created through the procedures a person's
 * actions go through rather than written into the tables.
 *
 * `history` is in the list because it is the table nothing would object to: its rows are only
 * ever inserted, nothing joins them at write time, and no constraint would notice a duplicate.
 */
async function seedEveryConcept(api, label) {
	const tenant = await seedTenant(api);
	const complex = await api.complex.create({ name: `Complex ${label}`, location: 'Riyadh' });
	const unit = await api.complex.units.create({ name: `Unit ${label}`, complexId: complex.id });
	const contract = await api.contract.create({
		tenantId: tenant.id,
		start: monthsFromNow(-1),
		end: monthsFromNow(11),
		interval: '12m',
		cost: 1000
	});

	await api.contract.units.set({ contractId: contract.id, unitIds: [unit.id] });

	const payment = await api.contract.payments.create({
		contractId: contract.id,
		date: monthsFromNow(0),
		amount: 1000
	});

	await api.history.append({
		entries: [
			{ concept: 'contract', recordId: contract.id, action: 'created', record: `CT-${label}` }
		]
	});

	const [entry] = await api.history.getMany({ concept: 'contract', recordId: contract.id });

	return {
		tenant: tenant.id,
		complex: complex.id,
		unit: unit.id,
		contract: contract.id,
		payment: payment.id,
		history: entry.id
	};
}

test('two workspaces populate every concept without minting a single shared identity', async () => {
	const [one, two] = await Promise.all([createApi(), createApi()]);

	const [here, there] = await Promise.all([seedEveryConcept(one, 'A'), seedEveryConcept(two, 'B')]);

	const concepts = ['tenant', 'complex', 'unit', 'contract', 'payment', 'history'];

	// counted rather than spot-checked, and per concept, so a concept that quietly created
	// nothing cannot pass by leaving the totals looking right
	for (const concept of concepts) {
		for (const [where, minted] of [
			['the first workspace', here],
			['the second workspace', there]
		]) {
			assert.ok(
				isRecordId(minted[concept]),
				`${where} should have minted a well-formed identity for its ${concept}, got ${minted[concept]}`
			);
		}
	}

	const all = [...concepts.map((c) => here[c]), ...concepts.map((c) => there[c])];

	assert.equal(all.length, concepts.length * 2, 'every concept in both workspaces should be here');
	assert.equal(
		new Set(all).size,
		all.length,
		'no two records should share an identity, across the two workspaces or within either'
	);
});

test('a stated identity is kept, so undoing a deletion restores the record rather than a copy', async () => {
	const api = await createApi();
	const tenant = await seedTenant(api);

	await api.tenant.delete({ id: tenant.id });

	const restored = await api.tenant.create({
		id: tenant.id,
		name: tenant.name,
		nationalId: tenant.nationalId,
		phone: tenant.phone
	});

	assert.equal(restored.id, tenant.id, 'the record should come back as itself (ADR 0026)');
});

/**
 * The part of an identity that two *machines* rely on, asserted directly.
 *
 * The test above populates two workspaces in one process, and that is weaker than it reads:
 * `newId` orders identities minted in the same millisecond with a process-local counter, so
 * two workspaces sharing a process stay distinct even with no randomness at all. Measured —
 * stripping the random tail out of `newId` leaves every assertion above passing.
 *
 * Two disconnected replicas do not share that counter. What keeps them apart is the 62-bit
 * random tail, and this is the assertion that it is there. It is the local stand-in for the
 * half of criterion 17 that waits on the hosted client.
 */
test('an identity carries randomness rather than only its position in a sequence', () => {
	const minted = Array.from({ length: 500 }, () => newId());
	const tails = minted.map((id) => id.slice(24));

	assert.equal(
		new Set(tails).size,
		tails.length,
		'the tail below the variant should differ for every identity, not follow a sequence'
	);

	// and it is not simply counting: consecutive tails should not be one apart
	const consecutive = tails.filter(
		(tail, at) => at > 0 && BigInt(`0x${tail}`) - BigInt(`0x${tails[at - 1]}`) === 1n
	);

	assert.ok(
		consecutive.length < 5,
		`the tail should be random rather than incremented, and ${consecutive.length} of 499 followed the last by one`
	);
});
