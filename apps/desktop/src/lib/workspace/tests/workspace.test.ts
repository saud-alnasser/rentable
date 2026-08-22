import assert from 'node:assert/strict';
import test from 'node:test';

import type { ImportTable } from '$lib/platform/host.ts';

import { toTables } from './file.ts';
import {
	type TransferConcept,
	type TransferContract,
	type WorkspaceHeld,
	type WorkspacePlan,
	type WorkspaceSheetPlan,
	type WorkspaceTransfer,
	emptyHeld,
	isWorkspaceImportable,
	planWorkspaceImport,
	toContractReference,
	toIsoDay,
	toUnitParts,
	toUnitReference
} from '../workspace.ts';

const DAY = 86_400_000;
// the day these files are read as being. Fixed rather than the wall clock: one of the rules the
// planning pass applies is measured against it, so a suite that read the real clock would be
// asking a different question every day it ran.
const NOW = Date.UTC(2026, 5, 15);

const START = Date.UTC(2026, 0, 1);
const END = Date.UTC(2026, 11, 31);

/** a workspace with one of everything, and every reference between them. */
function aWorkspace(): WorkspaceTransfer {
	const tenant = { name: 'Abby Kris', nationalId: '1234567890', phone: '+966512345678' };
	const contract: TransferContract = {
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
function sheetOf(plan: WorkspacePlan, concept: TransferConcept): WorkspaceSheetPlan {
	const sheet = plan.sheets.find((each) => each.concept === concept);

	// a plan read for a concept always carries that concept's line, so a plan that does not is a
	// failure of the subject rather than a shape a caller below has to answer for.
	assert.ok(sheet, `the plan reports no sheet for ${concept}`);

	return sheet;
}

/** the same workspace as the names it would report holding. */
function heldWorkspace(workspace: WorkspaceTransfer): WorkspaceHeld {
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

/** the four concepts a directory of its own writes a file for. Tenants has no directory. */
const DIRECTORY_CONCEPTS = ['complexes', 'units', 'contracts', 'payments'] as const;

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
const DIRECTORY_FILES: Record<(typeof DIRECTORY_CONCEPTS)[number], ImportTable> = {
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
	const plan = planWorkspaceImport(toTables(workspace), NOW, emptyHeld());

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
	const plan = planWorkspaceImport(tables, NOW, emptyHeld());

	assert.ok(isWorkspaceImportable(plan));
	assert.equal(plan.transfer.contracts.length, 1);
});

test('a sheet the file does not carry is not an error, and the rest still reads', () => {
	const tables = toTables(aWorkspace()).filter((table) => table.name === 'Tenants');
	const plan = planWorkspaceImport(tables, NOW, emptyHeld());

	assert.ok(isWorkspaceImportable(plan));
	assert.equal(sheetOf(plan, 'tenants').present, true);
	assert.equal(sheetOf(plan, 'contracts').present, false);
	assert.equal(plan.transfer.tenants.length, 1);
});

test('a reference nothing answers to refuses the file whole, naming the sheet and the row', () => {
	const workspace = aWorkspace();

	workspace.contracts[0].units = [toUnitReference('Al Nakheel', 'B9')];

	const plan = planWorkspaceImport(toTables(workspace), NOW, emptyHeld());

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

	const plan = planWorkspaceImport(toTables(workspace), NOW, emptyHeld());

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
	const plan = planWorkspaceImport(tables, NOW, {
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

	const plan = planWorkspaceImport(toTables(workspace), NOW, {
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

	const plan = planWorkspaceImport(toTables(workspace), NOW, emptyHeld());

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
	const plan = planWorkspaceImport(tables, NOW, emptyHeld());

	assert.deepEqual(sheetOf(plan, 'tenants').missingColumns, ['Phone']);
	assert.equal(isWorkspaceImportable(plan), false);
});

// the pair that makes a payment different from every other record here. Reading one file twice
// must not double a workspace, and two payments that happen to match must both survive.
test('a payment already recorded is not imported a second time', () => {
	const workspace = aWorkspace();
	const plan = planWorkspaceImport(toTables(workspace), NOW, {
		...emptyHeld(),
		payments: [[workspace.contracts[0].reference, '2026-01-02', '1500']]
	});

	assert.equal(sheetOf(plan, 'payments').rejected.length, 1);
	assert.deepEqual(plan.transfer.payments, []);
});

test('two identical payments are two payments', () => {
	const workspace = aWorkspace();

	workspace.payments.push({ ...workspace.payments[0] });

	const plan = planWorkspaceImport(toTables(workspace), NOW, emptyHeld());

	assert.deepEqual(sheetOf(plan, 'payments').collisions, []);
	assert.equal(plan.transfer.payments.length, 2);
	assert.ok(isWorkspaceImportable(plan));
});

test('a row wrong on its own is turned away and the file still reads', () => {
	const workspace = aWorkspace();

	workspace.tenants.push({ name: 'Bad Id', nationalId: '99', phone: '+966559999999' });

	const plan = planWorkspaceImport(toTables(workspace), NOW, emptyHeld());

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

	for (const concept of DIRECTORY_CONCEPTS) {
		const plan = planWorkspaceImport([DIRECTORY_FILES[concept]], NOW, held, [concept]);
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
	const plan = planWorkspaceImport([DIRECTORY_FILES.contracts], NOW, heldWorkspace(workspace), [
		'contracts'
	]);
	const sheet = sheetOf(plan, 'contracts');

	assert.deepEqual(sheet.missingColumns, ['Interval', 'Cost']);
	assert.equal(sheet.unreadable, false);
	assert.equal(sheet.rejected[0].reason, 'duplicate-of-existing');
});

test('a directory reports its own concept and is not asked about the other four', () => {
	const plan = planWorkspaceImport([DIRECTORY_FILES.complexes], NOW, emptyHeld(), ['complexes']);

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
		NOW,
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
		NOW,
		held,
		['units']
	);
	const fromDirectory = planWorkspaceImport(
		[{ ...DIRECTORY_FILES.units, rows: [['Al Nakheel', 'A2', 'vacant', '']] }],
		NOW,
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
	const asDirectory = planWorkspaceImport([DIRECTORY_FILES.complexes], NOW, held, ['complexes']);
	const asWorkspace = planWorkspaceImport([DIRECTORY_FILES.complexes], NOW, held);

	assert.equal(sheetOf(asDirectory, 'complexes').present, true);
	assert.ok(asWorkspace.sheets.every((sheet) => !sheet.present));
});

// and a tab that does name its concept is still read by that name, even alone: a delimited file
// carries the name the reader gave it, and `complexes.csv` says what it is.
test('a table named after its concept is read by that name', () => {
	const plan = planWorkspaceImport(
		[{ ...DIRECTORY_FILES.complexes, name: 'complexes' }],
		NOW,
		emptyHeld(),
		['complexes']
	);

	assert.equal(sheetOf(plan, 'complexes').present, true);
	assert.equal(plan.transfer.complexes.length, 1);
});

test('a file with no sheet this recognises has nothing to import', () => {
	const plan = planWorkspaceImport(
		[{ name: 'Sheet1', headers: ['a'], rows: [['b']] }],
		NOW,
		emptyHeld()
	);

	assert.equal(isWorkspaceImportable(plan), false);
	assert.ok(plan.sheets.every((sheet) => !sheet.present));
});

// A contract row is read against the contract domain's own rules rather than against a weaker
// restatement of them. Both of the terms below reached the workspace before: the planner asked for
// a cost that was merely not negative and asked nothing at all about the term, so a file could
// write a contract `contract.create` would have refused, and `contract/renewal.ts` states outright
// that a term matching no whole number of cycles cannot arise through a router.
//
// **The payment is dropped from the two fixtures below, and the test after them is why.** A
// contract that is turned away leaves every payment naming it unresolved, and an unresolved
// reference refuses a workspace file whole. These two would otherwise report that cascade rather
// than the rule under test, and the cascade is pinned on its own instead of hidden in all three.
function aWorkspaceWithNoPayments(): WorkspaceTransfer {
	return { ...aWorkspace(), payments: [] };
}

test('a contract worth nothing is turned away, and the rest of the file still reads', () => {
	const workspace = aWorkspaceWithNoPayments();

	workspace.contracts[0].cost = 0;

	const plan = planWorkspaceImport(toTables(workspace), NOW, emptyHeld());
	const sheet = sheetOf(plan, 'contracts');

	assert.deepEqual(sheet.rejected, [{ row: 2, reason: 'invalid', detail: '0' }]);
	assert.deepEqual(plan.transfer.contracts, []);
	// the row is turned away on its own, so nothing that did read is withheld with it
	assert.deepEqual(plan.unresolved, []);
	assert.equal(plan.transfer.tenants.length, 1);
	assert.equal(plan.transfer.complexes.length, 1);
});

test('a contract whose term matches no whole number of cycles is turned away', () => {
	const workspace = aWorkspaceWithNoPayments();

	// a twelve-month interval over a six-month term, nowhere near the five-day tolerance
	workspace.contracts[0].end = Date.UTC(2026, 5, 30);

	const plan = planWorkspaceImport(toTables(workspace), NOW, emptyHeld());

	assert.deepEqual(sheetOf(plan, 'contracts').rejected, [
		{ row: 2, reason: 'invalid', detail: '2026-06-30' }
	]);
	assert.deepEqual(plan.transfer.contracts, []);
	assert.equal(plan.transfer.tenants.length, 1);
});

// the tolerance is real slack rather than an exact-boundary rule: a term agreed as a year rarely
// lands on the day the arithmetic produces, and this is the case the planner must still admit.
test('a term inside the end-date tolerance is still read', () => {
	const workspace = aWorkspace();

	workspace.contracts[0].end = END - 3 * DAY;

	const plan = planWorkspaceImport(toTables(workspace), NOW, emptyHeld());

	assert.deepEqual(sheetOf(plan, 'contracts').rejected, []);
	assert.ok(isWorkspaceImportable(plan));
	assert.equal(plan.transfer.contracts.length, 1);
});

// The blast radius, pinned rather than designed around. A contract carries payments in every
// real file, so this is the ordinary shape of a file with one bad contract row in it, not an
// edge of it: the row is rejected, its payment is left naming nothing, and `refusedWhole` empties
// the transfer. That is what `WorkspacePlan.refusedWhole` says it does, deliberately, so the
// point of the test is that the reader is told the file is refused rather than left to infer it.
//
// It is the same outcome as the end-before-start rule, which predates the period rule beside it:
// this is a rule reaching a cascade that was already there, not a cascade the rule introduced.
test('a rejected contract takes its payments with it, and the file is refused whole', () => {
	const offTerm = aWorkspace();
	const backwards = aWorkspace();

	// eight days past the calculated end, so outside the five-day tolerance
	offTerm.contracts[0].end = END + 8 * DAY;
	backwards.contracts[0].end = START - DAY;

	for (const [what, workspace] of [
		['off-term', offTerm],
		['end before start', backwards]
	] as const) {
		const plan = planWorkspaceImport(toTables(workspace), NOW, emptyHeld());

		assert.equal(sheetOf(plan, 'contracts').rejected.length, 1, what);
		assert.deepEqual(plan.unresolved, [{ concept: 'payments', row: 2, reference: 'GOV-1' }], what);
		assert.equal(plan.refusedWhole, true, what);
		assert.equal(isWorkspaceImportable(plan), false, what);
		// nothing survives, including the tenant and the complex that read perfectly well
		assert.deepEqual(plan.transfer.tenants, [], what);
		assert.deepEqual(plan.transfer.complexes, [], what);
	}
});

// a file of one sheet has nothing that could depend on the dropped row, so it is turned away like
// any other bad row and the rest of the sheet still goes in. The other half of `refusedWhole`.
test('the same contract in a one-sheet file refuses only its own row', () => {
	const workspace = aWorkspace();

	workspace.contracts[0].end = END + 8 * DAY;

	const plan = planWorkspaceImport(
		toTables(workspace).filter((table) => table.name === 'Contracts'),
		NOW,
		{ ...emptyHeld(), tenants: [['1234567890', '+966512345678']] },
		['contracts']
	);

	assert.equal(sheetOf(plan, 'contracts').rejected.length, 1);
	assert.equal(plan.refusedWhole, false);
});

// the payment amount rule is the contract cost rule one sheet down, and it had the same gap
test('a payment of nothing is turned away', () => {
	const workspace = aWorkspace();

	workspace.payments[0].amount = 0;

	const plan = planWorkspaceImport(toTables(workspace), NOW, emptyHeld());

	assert.deepEqual(sheetOf(plan, 'payments').rejected, [
		{ row: 2, reason: 'invalid', detail: '0' }
	]);
});

// The rule the planning pass could not answer until it was given a clock, and the reason it now
// is. Asserted only at the boundary, a file carrying one of these planned as importable and was
// then refused whole at the write, naming no sheet and no row: the reader was told the file was
// fine and then told it was not, with nothing in between to act on.
test('a payment dated after the day the file is read is turned away, naming its row', () => {
	const workspace = aWorkspace();

	workspace.payments[0].date = NOW + DAY;

	const plan = planWorkspaceImport(toTables(workspace), NOW, emptyHeld());

	assert.deepEqual(sheetOf(plan, 'payments').rejected, [
		{ row: 2, reason: 'invalid', detail: toIsoDay(NOW + DAY) }
	]);
	// the row is dropped and the rest of the file still reads: nothing names a payment, so there
	// is nothing for it to take with it. That is the other half of `refusedWhole`, and it is why
	// the reader has to be told which row went rather than being told the file was refused.
	assert.deepEqual(plan.transfer.payments, []);
	assert.deepEqual(plan.unresolved, []);
	assert.equal(plan.refusedWhole, false);
	assert.equal(plan.transfer.tenants.length, 1);
});

// the boundary of the same rule, and the reason it is whole UTC days: a payment dated the day the
// file is read is money already received, whatever the time of day either side was written at.
test('a payment dated the day the file is read is money already received', () => {
	const workspace = aWorkspace();

	workspace.payments[0].date = NOW;

	const plan = planWorkspaceImport(toTables(workspace), NOW, emptyHeld());

	assert.deepEqual(sheetOf(plan, 'payments').rejected, []);
	assert.ok(isWorkspaceImportable(plan));
});
