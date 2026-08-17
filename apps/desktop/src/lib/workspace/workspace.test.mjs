import assert from 'node:assert/strict';
import test from 'node:test';

import { toTables } from './file.mjs';
import {
	emptyHeld,
	isWorkspaceImportable,
	planWorkspaceImport,
	toContractReference,
	toUnitParts,
	toUnitReference
} from './workspace.ts';

const DAY = 86_400_000;
const START = Date.UTC(2026, 0, 1);
const END = Date.UTC(2026, 11, 31);

/** a workspace with one of everything, and every reference between them. */
function aWorkspace() {
	const tenant = { name: 'Abby Kris', nationalId: '1234567890', phone: '+966512345678' };
	const contract = {
		reference: 'GOV-1',
		tenant: tenant.nationalId,
		units: [toUnitReference('Al Nakheel', 'A1')],
		start: START,
		end: END,
		interval: '12m',
		cost: 18_000,
		status: 'active',
		paidAmount: 1500,
		expectedAmount: 18_000
	};

	return {
		tenants: [tenant],
		complexes: [{ name: 'Al Nakheel', location: 'Riyadh' }],
		units: [{ complex: 'Al Nakheel', name: 'A1', status: 'occupied' }],
		contracts: [contract],
		payments: [{ contract: contract.reference, date: START + DAY, amount: 1500 }]
	};
}

/** the sheet a plan reports for one concept. */
function sheetOf(plan, concept) {
	return plan.sheets.find((sheet) => sheet.concept === concept);
}

test('a workspace written to a file plans back as the same records', () => {
	const workspace = aWorkspace();
	const plan = planWorkspaceImport(toTables(workspace), emptyHeld());

	assert.ok(isWorkspaceImportable(plan));
	assert.deepEqual(plan.transfer.tenants, workspace.tenants);
	assert.deepEqual(plan.transfer.complexes, workspace.complexes);
	// a unit stands vacant until a contract says otherwise, so the status the file carried is
	// not what comes back — it is derived, and reconciliation is what decides it.
	assert.deepEqual(plan.transfer.units, [{ complex: 'Al Nakheel', name: 'A1', status: 'vacant' }]);
	assert.deepEqual(plan.transfer.payments, workspace.payments);

	const [contract] = plan.transfer.contracts;

	assert.equal(contract.reference, 'GOV-1');
	assert.equal(contract.tenant, '1234567890');
	assert.deepEqual(contract.units, [toUnitReference('Al Nakheel', 'A1')]);
	assert.equal(contract.start, START);
	assert.equal(contract.end, END);
	assert.equal(contract.interval, '12m');
	assert.equal(contract.cost, 18_000);
});

test('every sheet is found by its own name, whatever order the file holds them in', () => {
	const tables = toTables(aWorkspace()).reverse();
	const plan = planWorkspaceImport(tables, emptyHeld());

	assert.ok(isWorkspaceImportable(plan));
	assert.equal(plan.transfer.contracts.length, 1);
});

test('a sheet the file does not carry is not an error, and the rest still reads', () => {
	const tables = toTables(aWorkspace()).filter((table) => table.name === 'Tenants');
	const plan = planWorkspaceImport(tables, emptyHeld());

	assert.ok(isWorkspaceImportable(plan));
	assert.equal(sheetOf(plan, 'tenants').present, true);
	assert.equal(sheetOf(plan, 'contracts').present, false);
	assert.equal(plan.transfer.tenants.length, 1);
});

test('a reference nothing answers to refuses the file whole, naming the sheet and the row', () => {
	const workspace = aWorkspace();

	workspace.contracts[0].units = [toUnitReference('Al Nakheel', 'B9')];

	const plan = planWorkspaceImport(toTables(workspace), emptyHeld());

	// and it carries: the contract dropped out, so its payment now names nothing either. Both
	// are reported, because a reader fixing the file needs to see the reference that started it
	// rather than only the row furthest downstream.
	assert.deepEqual(plan.unresolved, [
		{ concept: 'contracts', row: 2, reference: toUnitReference('Al Nakheel', 'B9') },
		{ concept: 'payments', row: 2, reference: 'GOV-1' }
	]);
	assert.equal(isWorkspaceImportable(plan), false);
	// the criterion: nothing is written, and nothing is even proposed — including the tenants
	// and complexes that were perfectly readable.
	assert.deepEqual(plan.transfer.tenants, []);
	assert.deepEqual(plan.transfer.complexes, []);
});

test('a payment naming a contract no sheet holds refuses the file whole', () => {
	const workspace = aWorkspace();

	workspace.payments[0].contract = 'GOV-9';

	const plan = planWorkspaceImport(toTables(workspace), emptyHeld());

	assert.deepEqual(plan.unresolved, [{ concept: 'payments', row: 2, reference: 'GOV-9' }]);
	assert.equal(isWorkspaceImportable(plan), false);
});

test('a reference resolves against the workspace as readily as against the file', () => {
	const workspace = aWorkspace();
	// the complexes and units sheets are dropped, so the unit the contract names can only be
	// answered by what the workspace already holds.
	const tables = toTables(workspace).filter(
		(table) => table.name !== 'Complexes' && table.name !== 'Units'
	);
	const plan = planWorkspaceImport(tables, {
		...emptyHeld(),
		complexes: ['Al Nakheel'],
		units: [['Al Nakheel', 'A1']]
	});

	assert.deepEqual(plan.unresolved, []);
	assert.ok(isWorkspaceImportable(plan));
	assert.equal(plan.transfer.contracts.length, 1);
});

test('a record the workspace already holds is turned away, and the rest still reads', () => {
	const workspace = aWorkspace();

	workspace.tenants.push({
		name: 'Omar Ali',
		nationalId: '2234567890',
		phone: '+966559999999'
	});

	const plan = planWorkspaceImport(toTables(workspace), {
		...emptyHeld(),
		tenants: [['1234567890', '+966512345678']]
	});

	assert.equal(sheetOf(plan, 'tenants').rejected.length, 1);
	assert.equal(sheetOf(plan, 'tenants').rejected[0].reason, 'duplicate-of-existing');
	assert.equal(plan.transfer.tenants.length, 1);
	assert.equal(plan.transfer.tenants[0].nationalId, '2234567890');
});

test('two rows of one sheet claiming the same record refuse it, with both rows named', () => {
	const workspace = aWorkspace();

	workspace.complexes.push({ name: 'Al Nakheel', location: 'Jeddah' });

	const plan = planWorkspaceImport(toTables(workspace), emptyHeld());

	assert.deepEqual(sheetOf(plan, 'complexes').collisions, [
		{ rows: [2, 3], identity: 'al nakheel' }
	]);
	assert.equal(isWorkspaceImportable(plan), false);
});

test('a sheet missing a column it needs refuses the file, naming the column', () => {
	const tables = toTables(aWorkspace()).map((table) =>
		table.name === 'Tenants'
			? { ...table, headers: table.headers.filter((header) => header !== 'Phone') }
			: table
	);
	const plan = planWorkspaceImport(tables, emptyHeld());

	assert.deepEqual(sheetOf(plan, 'tenants').missingColumns, ['Phone']);
	assert.equal(isWorkspaceImportable(plan), false);
});

// the pair that makes a payment different from every other record here. Reading one file twice
// must not double a workspace, and two payments that happen to match must both survive.
test('a payment already recorded is not imported a second time', () => {
	const workspace = aWorkspace();
	const plan = planWorkspaceImport(toTables(workspace), {
		...emptyHeld(),
		payments: [[workspace.contracts[0].reference, '2026-01-02', '1500']]
	});

	assert.equal(sheetOf(plan, 'payments').rejected.length, 1);
	assert.deepEqual(plan.transfer.payments, []);
});

test('two identical payments are two payments', () => {
	const workspace = aWorkspace();

	workspace.payments.push({ ...workspace.payments[0] });

	const plan = planWorkspaceImport(toTables(workspace), emptyHeld());

	assert.deepEqual(sheetOf(plan, 'payments').collisions, []);
	assert.equal(plan.transfer.payments.length, 2);
	assert.ok(isWorkspaceImportable(plan));
});

test('a row wrong on its own is turned away and the file still reads', () => {
	const workspace = aWorkspace();

	workspace.tenants.push({ name: 'Bad Id', nationalId: '99', phone: '+966559999999' });

	const plan = planWorkspaceImport(toTables(workspace), emptyHeld());

	assert.equal(sheetOf(plan, 'tenants').rejected.length, 1);
	assert.equal(sheetOf(plan, 'tenants').rejected[0].row, 3);
	assert.ok(isWorkspaceImportable(plan));
	assert.equal(plan.transfer.tenants.length, 1);
});

test('a contract with no government number is named by its tenant and the day it started', () => {
	assert.equal(
		toContractReference({ govId: null, tenant: '1234567890', start: START }),
		'1234567890 @ 2026-01-01'
	);
	assert.equal(
		toContractReference({ govId: 'GOV-1', tenant: '1234567890', start: START }),
		'GOV-1'
	);
	// stated but blank is the same as absent: an empty cell in a file is not a number.
	assert.equal(
		toContractReference({ govId: '  ', tenant: '1234567890', start: START }),
		'1234567890 @ 2026-01-01'
	);
});

test('a unit reference splits at the last separator, so a complex may carry one', () => {
	assert.deepEqual(toUnitParts(toUnitReference('Al Nakheel', 'A1')), ['Al Nakheel', 'A1']);
	assert.deepEqual(toUnitParts('North / South / A1'), ['North / South', 'A1']);
});

test('a file with no sheet this recognises has nothing to import', () => {
	const plan = planWorkspaceImport(
		[{ name: 'Sheet1', headers: ['a'], rows: [['b']] }],
		emptyHeld()
	);

	assert.equal(isWorkspaceImportable(plan), false);
	assert.ok(plan.sheets.every((sheet) => !sheet.present));
});
