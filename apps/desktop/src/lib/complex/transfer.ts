import * as s from '$lib/platform/database/schema';
import { ComplexSchema } from '$lib/platform/database/schema';
import { newId } from '$lib/platform/database/identity';
import { defineSheet } from '$lib/transfer';
import { asc } from 'drizzle-orm';
import { complexesNamed, ensureComplexNameAvailable } from './complex';

/**
 * THE COMPLEXES SHEET
 *
 * what a workspace file holds of the complexes, and how they are read back (`$lib/transfer`). A
 * complex points at nothing, so what its sheet reads is what it creates; a unit names one by name.
 */

/** A complex, as a file holds one. */
export type TransferComplex = { name: string; location: string };

/** a row of the sheet, as text, before it is a complex. */
type ComplexRow = { name: string; location: string };

export default defineSheet({
	concept: 'complexes',
	order: 2,
	names: { written: 'Complexes', accepted: ['complexes', 'المجمعات'] },
	view: 'viewComplex',
	columns: [
		{ header: 'Name', value: (complex: TransferComplex) => complex.name },
		{ header: 'Location', value: (complex) => complex.location }
	],
	read: async (db): Promise<TransferComplex[]> => {
		const complexes = await db
			.select()
			.from(s.complex)
			.orderBy(asc(s.complex.name), asc(s.complex.id));

		return complexes.map((complex) => ({ name: complex.name, location: complex.location }));
	},
	held: async (db) => {
		const complexes = await db.select({ name: s.complex.name }).from(s.complex);

		return complexes.map((complex) => complex.name);
	},
	fields: [
		{ id: 'name', headers: ['Name', 'الاسم'], required: true, identity: true },
		{ id: 'location', headers: ['Location', 'الموقع'], required: true }
	],
	toRecord: (row: ComplexRow) => ({ name: row.name.trim(), location: row.location.trim() }),
	answers: {
		record: (complex) => [complex.name],
		unknown: 'workspace.unknownComplex',
		ids: async (db) => {
			const complexes = await db.select({ id: s.complex.id, name: s.complex.name }).from(s.complex);

			return complexes.map((complex) => [[complex.name], complex.id] as const);
		}
	},
	input: ComplexSchema.pick({ name: true, location: true }),
	write: async (complexes, writing) => {
		// the plan rejected a name the workspace held, but one can arrive by sync before the write,
		// and no rule of the shared database refuses it any longer (effort 857, requirement 14).
		const taken = await complexesNamed(
			writing.db,
			complexes.map((complex) => complex.name)
		);

		ensureComplexNameAvailable(taken[0], taken[0]?.name);

		const rows = complexes.map((complex) => {
			const id = newId();

			writing.name([complex.name], id);

			return { id, name: complex.name, location: complex.location };
		});

		return {
			statements: rows.map((row) => writing.db.insert(s.complex).values(row)),
			count: rows.length
		};
	}
});
