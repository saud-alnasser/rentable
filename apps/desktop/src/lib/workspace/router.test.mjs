import assert from 'node:assert/strict';
import test from 'node:test';

import { createApi, monthsFromNow } from '$lib/api/testing.mjs';
import { toTables } from './file.mjs';
import { emptyHeld, isWorkspaceImportable, planWorkspaceImport } from './workspace.ts';

/** what a transfer carries into the write: only what a record actually holds. */
function toInput(transfer) {
	return {
		tenants: transfer.tenants,
		complexes: transfer.complexes,
		units: transfer.units.map((unit) => ({ complex: unit.complex, name: unit.name })),
		contracts: transfer.contracts.map((contract) => ({
			reference: contract.reference,
			tenant: contract.tenant,
			units: contract.units,
			start: contract.start,
			end: contract.end,
			interval: contract.interval,
			cost: contract.cost
		})),
		payments: transfer.payments
	};
}

/**
 * A workspace built through the ordinary procedures: a tenant, a complex with a unit, a
 * contract over that unit, and a payment against it.
 */
async function seedWorkspace(api) {
	const tenant = await api.tenant.create({
		name: 'Abby Kris',
		nationalId: '1234567890',
		phone: '+966512345678'
	});
	const complex = await api.complex.create({
		name: 'Al Nakheel',
		location: 'Riyadh',
		units: [{ name: 'A1' }, { name: 'A2' }]
	});
	const contract = await api.contract.create({
		govId: 'GOV-1',
		tenantId: tenant.id,
		unitIds: [complex.units[0].id],
		start: monthsFromNow(-1),
		end: monthsFromNow(11),
		interval: '12m',
		cost: 18_000
	});

	await api.contract.payments.create({
		contractId: contract.id,
		date: monthsFromNow(0),
		amount: 1500
	});

	return { tenant, complex, contract };
}

test('a workspace exported as a file imports into an empty one and reproduces it', async () => {
	const source = await createApi();

	await seedWorkspace(source);

	const written = await source.workspace.get();
	const target = await createApi();
	const plan = planWorkspaceImport(toTables(written), emptyHeld());

	assert.ok(isWorkspaceImportable(plan), 'the file it wrote is a file it can read');

	await target.workspace.importWhole(toInput(plan.transfer));

	const read = await target.workspace.get();

	assert.deepEqual(read.tenants, written.tenants);
	assert.deepEqual(read.complexes, written.complexes);
	// every relationship as well as every record: a unit knows its complex, a contract knows its
	// tenant and the unit it holds, and a payment knows its contract — all by name, because that
	// is the only thing the file carried.
	assert.deepEqual(read.units, written.units);
	assert.deepEqual(read.payments, written.payments);
	assert.deepEqual(
		read.contracts.map((contract) => ({ ...contract, units: [...contract.units] })),
		written.contracts.map((contract) => ({ ...contract, units: [...contract.units] }))
	);
});

test('the reproduced workspace derives its own statuses rather than trusting the file', async () => {
	const source = await createApi();

	await seedWorkspace(source);

	const written = await source.workspace.get();
	const target = await createApi();
	const plan = planWorkspaceImport(toTables(written), emptyHeld());

	await target.workspace.importWhole(toInput(plan.transfer));

	const [contract] = await target.contract.getMany({});

	// the file states a status, a paid amount and an expected amount for the reader, and none of
	// the three is read back in — reconciliation recomputes all of them from the term and the
	// payment that came with it.
	assert.equal(contract.paidAmount, written.contracts[0].paidAmount);
	assert.equal(contract.status, written.contracts[0].status);

	const units = await target.complex.units.getMany({
		complexId: (await target.complex.getMany({}))[0].id
	});

	assert.deepEqual(
		units.map((unit) => unit.status).sort(),
		written.units.map((unit) => unit.status).sort()
	);
});

test('a refused write leaves the workspace exactly as it was', async () => {
	const api = await createApi();

	await seedWorkspace(api);

	const before = await api.workspace.get();

	await assert.rejects(
		// the last statement of the batch is the one that cannot stand: the payment names a
		// contract no sheet holds and none of the rows before it may survive it.
		api.workspace.importWhole({
			tenants: [{ name: 'Omar Ali', nationalId: '2234567890', phone: '+966559999999' }],
			complexes: [{ name: 'Al Waha', location: 'Jeddah' }],
			units: [{ complex: 'Al Waha', name: 'B1' }],
			contracts: [],
			payments: [{ contract: 'GOV-404', date: monthsFromNow(0), amount: 100 }]
		})
	);

	assert.deepEqual(await api.workspace.get(), before);
});

test('a duplicate identity refuses the whole write, creating nothing', async () => {
	const api = await createApi();

	await seedWorkspace(api);

	const before = await api.workspace.get();

	await assert.rejects(
		api.workspace.importWhole({
			// the second tenant is fine; the first repeats a national id the workspace already
			// holds, and the unique constraint refuses the batch it is in.
			tenants: [
				{ name: 'Someone Else', nationalId: '1234567890', phone: '+966500000000' },
				{ name: 'Omar Ali', nationalId: '2234567890', phone: '+966559999999' }
			],
			complexes: [],
			units: [],
			contracts: [],
			payments: []
		})
	);

	assert.deepEqual(await api.workspace.get(), before);
});

test('what the workspace holds is reported by the names a file uses', async () => {
	const api = await createApi();

	await seedWorkspace(api);

	const held = await api.workspace.held();

	assert.deepEqual(held.tenants, [['1234567890', '+966512345678']]);
	assert.deepEqual(held.complexes, ['Al Nakheel']);
	assert.deepEqual(held.units.sort(), [
		['Al Nakheel', 'A1'],
		['Al Nakheel', 'A2']
	]);
	assert.deepEqual(held.contracts, ['GOV-1']);
});

test('a file read into a workspace that already holds its records adds nothing', async () => {
	const api = await createApi();

	await seedWorkspace(api);

	const written = await api.workspace.get();
	const plan = planWorkspaceImport(toTables(written), await api.workspace.held());

	// every row of it is already here, so there is nothing to agree to — which is what stops a
	// reader importing the same file twice and doubling their workspace.
	assert.equal(isWorkspaceImportable(plan), false);
});
