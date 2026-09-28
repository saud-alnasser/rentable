import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { type Api, createApi } from '$lib/app/tests/testing.ts';
import type { ExportSheet } from '$lib/platform/host.ts';
import { readBack } from './file.ts';
import {
	emptyHeld,
	isWorkspaceImportable,
	planWorkspaceImport,
	toTransferInput,
	toWorkbook
} from '../index.ts';

/**
 * THE WORKBOOK IS A PUBLIC CONTRACT
 *
 * What a workspace export hands the Rust writer: every sheet's name, its columns in order, the
 * sheets in order, and every cell as the kind of thing it is. `tauri/src/earlier.rs` writes the
 * same workbook from an earlier version's records, and people hold files this wrote, so none of
 * it may move.
 *
 * `workbook.json` was taken from the code as it stood before effort 840 made transfer a
 * capability (ticket 26), from the workspace seeded below. The test writes that workspace out
 * and compares the sheets with it, then reads the file back into an empty workspace and writes
 * that out too, which has to give the same sheets again.
 *
 * **Every date is fixed and every term has ended**, so nothing the clock derives (a status, an
 * expected amount, a unit standing occupied or vacant) differs between the day the fixture was
 * taken and the day the test runs.
 */

const day = (year: number, month: number, date: number) => Date.UTC(year, month - 1, date);

/**
 * Three tenants, one with no contract; two complexes, one unit held by nothing; a contract with a
 * government number holding two units, and one without holding one, whose reference is its
 * tenant and first day; payments against both, one of them in halalas.
 */
async function seed(api: Api) {
	const abby = await api.tenant.create({
		name: 'Abby Kris',
		nationalId: '1234567890',
		phone: '+966512345678'
	});
	const omar = await api.tenant.create({
		name: 'عمر الحربي',
		nationalId: '2234567891',
		phone: '+966553456789'
	});

	await api.tenant.create({ name: 'Sara Idle', nationalId: '1334567892', phone: '+966554567890' });

	const nakheel = await api.complex.create({
		name: 'Al Nakheel',
		location: 'Riyadh',
		units: [{ name: 'A1' }, { name: 'A2' }, { name: 'A3' }]
	});
	const yasmin = await api.complex.create({
		name: 'برج الياسمين',
		location: 'جدة',
		units: [{ name: '101' }]
	});

	const numbered = await api.contract.create({
		govId: 'GOV-1',
		tenantId: abby.id,
		start: day(2025, 1, 1),
		end: day(2026, 1, 1),
		interval: '12m',
		cost: 18_000
	});
	const unnumbered = await api.contract.create({
		tenantId: omar.id,
		start: day(2025, 3, 1),
		end: day(2025, 9, 1),
		interval: '1m',
		cost: 1_500.5
	});

	const nakheelUnits = await api.complex.units.getMany({ complexId: nakheel.id });
	const [yasminUnit] = await api.complex.units.getMany({ complexId: yasmin.id });
	const named = (name: string) => nakheelUnits.find((unit) => unit.name === name)!.id;

	await api.contract.units.set({ contractId: numbered.id, unitIds: [named('A1'), named('A2')] });
	await api.contract.units.set({ contractId: unnumbered.id, unitIds: [yasminUnit.id] });

	await api.payment.create({ contractId: numbered.id, date: day(2025, 1, 1), amount: 18_000 });
	await api.payment.create({ contractId: unnumbered.id, date: day(2025, 3, 1), amount: 1_500.5 });
	await api.payment.create({ contractId: unnumbered.id, date: day(2025, 4, 1), amount: 1_500.5 });
}

function expected(): ExportSheet[] {
	return JSON.parse(readFileSync(new URL('./workbook.json', import.meta.url), 'utf8'));
}

test('a seeded workspace exports the workbook it always has', async () => {
	const api = await createApi();

	await seed(api);

	assert.deepEqual(toWorkbook(await api.transfer.get()), expected());
});

test('the workbook read back into an empty workspace exports the same workbook', async () => {
	const workbook = expected();
	const target = await createApi();
	const plan = planWorkspaceImport(readBack(workbook), day(2026, 1, 2), emptyHeld());

	assert.ok(isWorkspaceImportable(plan), 'the workbook is a file this build reads');

	await target.transfer.importWhole(toTransferInput(plan.transfer));

	assert.deepEqual(toWorkbook(await target.transfer.get()), workbook);
});
