import * as s from '$lib/platform/database/schema';
import { UnitSchema, type Unit } from '$lib/platform/database/schema';
import { newId } from '$lib/platform/database/identity';
import { defineSheet } from '$lib/transfer';
import { asc, eq } from 'drizzle-orm';
import z from 'zod';

/**
 * THE UNITS SHEET
 *
 * what a workspace file holds of the units, and how they are read back (`$lib/transfer`). A unit
 * names the complex holding it, which the file or the workspace has to answer; a contract names a
 * unit by its complex and its own name together.
 */

/** A unit, as a file holds one. */
export type TransferUnit = { complex: string; name: string; status: Unit['status'] };

/** a row of the sheet, as text, before it is a unit. */
type UnitRow = { complex: string; name: string };

export default defineSheet({
	concept: 'units',
	order: 3,
	names: { written: 'Units', accepted: ['units', 'الوحدات'] },
	view: 'viewUnit',
	columns: [
		{ header: 'Complex', value: (unit: TransferUnit) => unit.complex },
		{ header: 'Unit', value: (unit) => unit.name },
		// written for the reader and never read back: a unit's status is what its contracts make
		// it, and reconciliation decides it the moment the workspace holds both.
		{ header: 'Status', value: (unit) => unit.status }
	],
	// a status as stored, or as the contracts holding the unit make it now where the read derives: a
	// workspace read on Turso may hold one nobody reconciled since a day passed. The derivation is
	// the contract's, which it contributes, since the contract depends on the unit.
	read: async (db, deriving): Promise<TransferUnit[]> => {
		const units = await db
			.select({
				id: s.unit.id,
				name: s.unit.name,
				status: s.unit.status,
				complex: s.complex.name
			})
			.from(s.unit)
			.innerJoin(s.complex, eq(s.unit.complexId, s.complex.id))
			.orderBy(asc(s.complex.name), asc(s.unit.name), asc(s.unit.id));

		const derived =
			deriving &&
			units.length > 0 &&
			(await deriving.contributions.unit.unitStatuses(
				{ ...deriving, db, clock: { now: () => deriving.now } },
				units.map((unit) => unit.id)
			));

		return units.map((unit) => ({
			complex: unit.complex,
			name: unit.name,
			status: derived ? (derived.get(unit.id) ?? 'vacant') : unit.status
		}));
	},
	// each unit's complex and its own name.
	held: async (db) => {
		const units = await db
			.select({ name: s.unit.name, complex: s.complex.name })
			.from(s.unit)
			.innerJoin(s.complex, eq(s.unit.complexId, s.complex.id));

		return units.map((unit) => [unit.complex, unit.name]);
	},
	// the second spelling of each is what a directory's own export writes. The transfer's sheet says
	// `Unit`, because a sheet sitting beside four others has to say which record the column is
	// about; the units directory says `Name`, because on a list of units nothing else it could be.
	// Both name the same column, so both are read.
	fields: [
		{ id: 'complex', headers: ['Complex', 'المجمع', 'مجمع'], required: true, identity: true },
		{ id: 'name', headers: ['Unit', 'الوحدة', 'Name', 'الاسم'], required: true, identity: true }
	],
	references: (row: UnitRow) => [
		{ concept: 'complexes', values: [row.complex], reference: row.complex.trim() }
	],
	toRecord: (row) => ({
		complex: row.complex.trim(),
		name: row.name.trim(),
		status: 'vacant' as const
	}),
	answers: {
		record: (unit) => [unit.complex, unit.name],
		unknown: 'workspace.unknownUnit',
		ids: async (db) => {
			const units = await db
				.select({ id: s.unit.id, name: s.unit.name, complex: s.complex.name })
				.from(s.unit)
				.innerJoin(s.complex, eq(s.unit.complexId, s.complex.id));

			return units.map((unit) => [[unit.complex, unit.name], unit.id] as const);
		}
	},
	toInput: (unit) => ({ complex: unit.complex, name: unit.name }),
	input: UnitSchema.pick({ name: true }).extend({ complex: z.string() }),
	write: async (units, writing) => {
		const rows = units.map((unit) => {
			const id = newId();

			writing.name([unit.complex, unit.name], id);

			return {
				id,
				name: unit.name,
				// a unit stands vacant until a contract says otherwise, and reconciliation is what
				// says otherwise. The file's own status column is not read, for the same reason a
				// contract's is not: it is derived.
				status: 'vacant' as const,
				complexId: writing.resolve('complexes', unit.complex)
			};
		});

		return {
			statements: rows.map((row) => writing.db.insert(s.unit).values(row)),
			count: rows.length,
			touched: { unitIds: rows.map((row) => row.id) }
		};
	}
});
