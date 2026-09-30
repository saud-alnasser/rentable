import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import type { ImportTable } from '$lib/transfer/host.ts';

import '$lib/app/transfer.ts';
import {
	countTransfer,
	isWorkspaceImportable,
	planWorkspaceImport,
	transferConcepts
} from '$lib/transfer/index.ts';

// The records 0.12.0 and 0.13.0 left in `app.db`, as `tauri/src/upgrade/record.rs` reads them:
// the tables its tests find for either version, one record of every kind. The file is the
// contract between the two suites, which cannot call each other.
const tables: ImportTable[] = JSON.parse(
	readFileSync(new URL('./app-database.json', import.meta.url), 'utf8')
);

// the day these tables are read as being, after every payment they hold.
const NOW = Date.UTC(2026, 8, 27);

test('the records of an earlier version plan as an import creating every one of them', () => {
	const plan = planWorkspaceImport(tables, NOW);

	for (const concept of transferConcepts()) {
		const sheet = plan.sheets.find((each) => each.concept === concept);
		const table = tables.find((each) => each.name.toLowerCase() === concept);

		assert.ok(sheet?.present, `the ${concept} sheet is read`);
		assert.ok(table && table.rows.length > 0, `the ${concept} sheet holds a record`);
		assert.deepEqual(sheet.missingColumns, [], concept);
		assert.deepEqual(sheet.rejected, [], concept);
		assert.deepEqual(sheet.collisions, [], concept);
		assert.equal(sheet.create, table.rows.length, `every ${concept} record is created`);
		assert.equal(plan.transfer[concept].length, table.rows.length, concept);
	}

	assert.deepEqual(plan.unresolved, []);
	assert.equal(plan.refusedWhole, false);
	assert.ok(isWorkspaceImportable(plan));
	assert.equal(
		countTransfer(plan.transfer),
		tables.reduce((total, table) => total + table.rows.length, 0)
	);
});

test('a contract with no government number is found again by its tenant and its first day', () => {
	const plan = planWorkspaceImport(tables, NOW);

	assert.deepEqual(
		plan.transfer.contracts.map((contract) => [contract.reference, contract.units]),
		[
			['GOV-1', ['Al Nakheel / A2']],
			['2234567891 @ 2026-03-01', ['برج الياسمين / 101']]
		]
	);
	assert.deepEqual(
		plan.transfer.payments.map((payment) => [payment.contract, payment.amount]),
		[
			['GOV-1', 18_000],
			['2234567891 @ 2026-03-01', 1_500.5],
			['2234567891 @ 2026-03-01', 1_500.5]
		]
	);
});
