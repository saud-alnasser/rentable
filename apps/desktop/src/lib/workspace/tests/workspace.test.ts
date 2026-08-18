import assert from 'node:assert/strict';
import test from 'node:test';

import { toTables } from '../file.mjs';
import {
	emptyHeld,
	isWorkspaceImportable,
	planWorkspaceImport,
	toContractReference,
	toIsoDay,
	toUnitParts,
	toUnitReference
} from '../workspace.ts';

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

/** the same workspace as the names it would report holding. */
function heldWorkspace(workspace) {
	return {
		tenants: workspace.tenants.map((tenant) => [tenant.nationalId, tenant.phone]),
		complexes: workspace.complexes.map((complex) => complex.name),
		units: workspace.units.map((unit) => [unit.complex, unit.name]),
		contracts: workspace.contracts.map((contract) => contract.reference),
		payments: workspace.payments.map((payment) => [
			payment.contract,
			toIsoDay(payment.date),
			String(payment.amount)
		])
	};
}

/**
 * What each directory's own export puts on disk, for the workspace `aWorkspace` describes.
 *
 * Restated here rather than read from the four components, which a test running under node cannot
 * import — the same arrangement the Rust suite's delimited fixture already uses, and for the same
 * reason: it is the contract between two halves that cannot call each other. The headings are the
 * half that matters, because they are what the reading side matches on.
 *
 * The tab is `Sheet1` throughout, which is what a workbook of one sheet is called by the writer
 * that made it. Nothing about the name says what the rows are — the directory the file was opened
 * from is what says that.
 */
const DIRECTORY_FILES = {
	// `complex/component/directory.svelte`
	complexes: {
		name: 'Sheet1',
		headers: ['Name', 'Location', 'Units', 'Occupied Units', 'Vacant Units'],
		rows: [['Al Nakheel', 'Riyadh', '1', '1', '0']]
	},
	// `complex/component/unit-directory.svelte` — the unit's own name under `Name`, where the
	// workspace's Units sheet says `Unit`.
	units: {
		name: 'Sheet1',
		headers: ['Complex', 'Name', 'Status', 'Tenant'],
		rows: [['Al Nakheel', 'A1', 'occupied', 'Abby Kris']]
	},
	// `contract/component/directory.svelte` — a document rather than a file a contract could be
	// built from: no interval, no cost, and the tenant by the name a person reads.
	contracts: {
		name: 'Sheet1',
		headers: ['Tenant', 'Government Id', 'Start', 'End', 'Payments', 'Status', 'Paid', 'Expected'],
		rows: [['Abby Kris', 'GOV-1', '2026-01-01', '2026-12-31', '1', 'active', '1500', '18000']]
	},
	// `payment/component/ledger.svelte`
	payments: {
		name: 'Sheet1',
		headers: ['Contract', 'Tenant', 'Payment Date', 'Amount'],
		rows: [['GOV-1', 'Abby Kris', '2026-01-02', '1500']]
	}
};

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

// a directory is the same transfer scoped to one concept. What follows is that scope: the file
// each directory writes coming back into it, the reference a row makes being resolved, and a row
// that names nothing costing the row rather than the file.

test('the file each directory exports imports back into it, changing nothing', () => {
	const workspace = aWorkspace();
	const held = heldWorkspace(workspace);

	for (const [concept, table] of Object.entries(DIRECTORY_FILES)) {
		const plan = planWorkspaceImport([table], held, [concept]);
		const sheet = sheetOf(plan, concept);

		// the file is read — its rows are recognised as records, and as records already here.
		assert.equal(sheet.present, true, concept);
		assert.equal(sheet.unreadable, false, concept);
		assert.deepEqual(sheet.collisions, [], concept);
		assert.deepEqual(plan.unresolved, [], concept);
		assert.equal(
			sheet.rejected.every((rejection) => rejection.reason === 'duplicate-of-existing'),
			true,
			concept
		);

		// and it would do nothing, which is the whole criterion: an export of a list can never
		// quietly double it.
		assert.equal(sheet.create, 0, concept);
		assert.equal(isWorkspaceImportable(plan), false, concept);
	}
});

// the contracts directory writes a document for a person: it carries the figures that were on the
// row and not the fields a contract is made of. It still has to be able to say which contracts it
// is about, which is what separates a file that cannot be read from one that cannot be built from.
test('a file missing a column a record is built from still says which records it holds', () => {
	const workspace = aWorkspace();
	const plan = planWorkspaceImport([DIRECTORY_FILES.contracts], heldWorkspace(workspace), [
		'contracts'
	]);
	const sheet = sheetOf(plan, 'contracts');

	assert.deepEqual(sheet.missingColumns, ['Interval', 'Cost']);
	assert.equal(sheet.unreadable, false);
	assert.equal(sheet.rejected[0].reason, 'duplicate-of-existing');
});

test('a directory reports its own concept and is not asked about the other four', () => {
	const plan = planWorkspaceImport([DIRECTORY_FILES.complexes], emptyHeld(), ['complexes']);

	assert.deepEqual(
		plan.sheets.map((sheet) => sheet.concept),
		['complexes']
	);
	assert.equal(plan.transfer.complexes.length, 1);
});

// the criterion: the row is turned away naming what it could not find, and the rest of the file
// still goes in. A file of one concept holds nothing that could have depended on the dropped row,
// which is what separates it from a workspace file — there, the same reference refuses the lot.
test('a row naming a record the workspace does not hold is turned away, and the rest imports', () => {
	const plan = planWorkspaceImport(
		[
			{
				...DIRECTORY_FILES.units,
				rows: [
					['Al Nakheel', 'A2', 'vacant', ''],
					['Palm Court', 'B1', 'vacant', '']
				]
			}
		],
		{ ...emptyHeld(), complexes: ['Al Nakheel'] },
		['units']
	);

	assert.deepEqual(plan.unresolved, [{ concept: 'units', row: 3, reference: 'Palm Court' }]);
	assert.equal(plan.refusedWhole, false);
	assert.ok(isWorkspaceImportable(plan));
	assert.deepEqual(plan.transfer.units, [{ complex: 'Al Nakheel', name: 'A2', status: 'vacant' }]);
});

// AC5, made observable: the workspace's Units sheet and the units directory's own file spell the
// unit's name under different headings, and one declaration reads both into the same records.
test('a sheet of the workspace file and a directory file of the same concept read alike', () => {
	const held = { ...emptyHeld(), complexes: ['Al Nakheel'] };
	const fromSheet = planWorkspaceImport(
		[
			{
				name: 'Units',
				headers: ['Complex', 'Unit', 'Status'],
				rows: [['Al Nakheel', 'A2', 'vacant']]
			}
		],
		held,
		['units']
	);
	const fromDirectory = planWorkspaceImport(
		[{ ...DIRECTORY_FILES.units, rows: [['Al Nakheel', 'A2', 'vacant', '']] }],
		held,
		['units']
	);

	assert.deepEqual(fromSheet.transfer.units, fromDirectory.transfer.units);
	assert.equal(fromDirectory.transfer.units.length, 1);
});

// a directory's file is one table whose tab was named by whatever wrote it. Read for one concept
// that is the sheet; read for a workspace it is a tab nothing recognises, which is what keeps a
// list's export from being mistaken for a workspace.
test('a single table is the sheet a directory asked for, and no sheet of a workspace', () => {
	const held = { ...emptyHeld(), complexes: ['Al Nakheel'] };
	const asDirectory = planWorkspaceImport([DIRECTORY_FILES.complexes], held, ['complexes']);
	const asWorkspace = planWorkspaceImport([DIRECTORY_FILES.complexes], held);

	assert.equal(sheetOf(asDirectory, 'complexes').present, true);
	assert.ok(asWorkspace.sheets.every((sheet) => !sheet.present));
});

// and a tab that does name its concept is still read by that name, even alone: a delimited file
// carries the name the reader gave it, and `complexes.csv` says what it is.
test('a table named after its concept is read by that name', () => {
	const plan = planWorkspaceImport(
		[{ ...DIRECTORY_FILES.complexes, name: 'complexes' }],
		emptyHeld(),
		['complexes']
	);

	assert.equal(sheetOf(plan, 'complexes').present, true);
	assert.equal(plan.transfer.complexes.length, 1);
});

test('a file with no sheet this recognises has nothing to import', () => {
	const plan = planWorkspaceImport(
		[{ name: 'Sheet1', headers: ['a'], rows: [['b']] }],
		emptyHeld()
	);

	assert.equal(isWorkspaceImportable(plan), false);
	assert.ok(plan.sheets.every((sheet) => !sheet.present));
});
