import assert from 'node:assert/strict';
import test from 'node:test';

import { type Api, createApi, monthsFromNow } from '$lib/api/tests/testing.ts';
import { toTables } from './file.ts';
import {
	emptyHeld,
	isWorkspaceImportable,
	planWorkspaceImport,
	toIsoDay,
	toTransferInput as toInput,
	toUnitReference
} from '../workspace.ts';

/**
 * A workspace built through the ordinary procedures: a tenant, a complex with two units, a
 * contract for that tenant holding one of them, and a payment against it.
 *
 * **The assignment is what makes this fixture worth running.** It used to be asked for by
 * passing `unitIds` to `contract.create`, which does not take them — the key was dropped at the
 * input boundary, no assignment row was ever written, and the round trip below compared an
 * empty list against an empty one for two efforts (#562). It is said properly now, through
 * `contract.units.set`, which is the only procedure that writes one.
 *
 * **Order is load-bearing:** the units are set before the payment, because a contract with a
 * payment recorded against it refuses to have its units changed.
 */
async function seedWorkspace(api: Api) {
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
		start: monthsFromNow(-1),
		end: monthsFromNow(11),
		interval: '12m',
		cost: 18_000
	});

	const [unit] = await api.complex.units.getMany({ complexId: complex.id });

	await api.contract.units.set({ contractId: contract.id, unitIds: [unit.id] });

	await api.contract.payments.create({
		contractId: contract.id,
		date: monthsFromNow(0),
		amount: 1500
	});

	return { tenant, complex, contract, unit };
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
	// stated before the comparison rather than left to it: two empty lists satisfy a deep
	// equality without the round trip having carried an assignment at all, which is exactly how
	// this test certified #562 for two efforts.
	assert.deepEqual(written.contracts[0].units, [toUnitReference('Al Nakheel', 'A1')]);
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

test('a unit no sheet answers for is named back the way the file wrote it', async () => {
	const api = await createApi();

	// the guard behind the planning pass rather than a second one: a file reaching here with an
	// unresolvable reference has already been refused, and what this pins is that the last resort
	// still refuses it and still says which unit — as a person spelled it, not as it is keyed.
	await assert.rejects(
		api.workspace.importWhole({
			tenants: [{ name: 'Omar Ali', nationalId: '2234567890', phone: '+966559999999' }],
			complexes: [{ name: 'Al Waha', location: 'Jeddah' }],
			units: [],
			contracts: [
				{
					reference: 'GOV-7',
					tenant: '2234567890',
					units: [toUnitReference('Al Waha', 'B1')],
					start: monthsFromNow(-1),
					end: monthsFromNow(11),
					interval: '12m',
					cost: 12_000
				}
			],
			payments: []
		}),
		{ message: "no unit called 'Al Waha / B1'" }
	);
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

// a tenant is unique on two columns, and the second one is the quiet half: a file whose rows are
// all new by national id can still carry a phone number somebody already has. Carried over from
// the tenant-only import this replaced, which asserted both.
test('a phone another tenant already holds refuses the write the same way', async () => {
	const api = await createApi();

	await seedWorkspace(api);

	const before = await api.workspace.get();

	await assert.rejects(
		api.workspace.importWhole({
			tenants: [{ name: 'Omar Ali', nationalId: '2234567890', phone: '+966512345678' }],
			complexes: [],
			units: [],
			contracts: [],
			payments: []
		}),
		/phone|UNIQUE/i
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

// a directory writes into a workspace that is mostly already there, which is what makes the
// touch-set a different question than it was for a workspace read into an empty machine: a file
// of payments creates no contract at all, and the contract it moves is one that was already here.
test('payments read into a ledger move the contract they are against', async () => {
	const api = await createApi();

	await seedWorkspace(api);

	const [before] = await api.contract.getMany({});

	assert.equal(before.paidAmount, 1500);

	const plan = planWorkspaceImport(
		[
			{
				name: 'Sheet1',
				headers: ['Contract', 'Tenant', 'Payment Date', 'Amount'],
				rows: [['GOV-1', 'Abby Kris', toIsoDay(monthsFromNow(1)), '2500']]
			}
		],
		await api.workspace.held(),
		['payments']
	);

	assert.ok(isWorkspaceImportable(plan));

	await api.workspace.importWhole(toInput(plan.transfer));

	const [after] = await api.contract.getMany({});

	// the criterion behind the criterion: the money moved *and* the derived column that reports it
	// moved with it. Reconciled over the contracts the payments named rather than over the ones
	// the write created, of which there were none.
	assert.equal(after.paidAmount, 4000);
	assert.equal(after.paymentCount, 2);
});
