import type { Database } from '$lib/api/context';
import {
	matchesAnySearch,
	RecordSearchSchema,
	type RecordMatch
} from '$lib/platform/database/search';
import { ensureIdFree } from '$lib/api/refusal';
import { newId } from '$lib/platform/database/identity';
import * as s from '$lib/platform/database/schema';
import { ComplexSchema, UnitSchema } from '$lib/platform/database/schema';
import { planSelection } from '$lib/api/selection';
import { refuse } from '$lib/api/refusal';
import { autosync, procedure, refuseMissing, router } from '$lib/api/trpc';
import {
	COMPLEX_SORT_COLUMN_IDS,
	complexesNamed,
	ensureComplexDeletable,
	ensureComplexNameAvailable,
	ensureComplexStillExists,
	ensureUnitNamesDistinct,
	flagsToDeleteUnitsOf,
	whatRefusesComplexDeletion,
	type ComplexSortColumnId
} from '$lib/complex/complex';
import type { RecordFlag } from '$lib/permission';
import { permits } from '@rentable/workspace-permission';
import { asc, desc, eq, inArray, sql, type AnyColumn, type SQL } from 'drizzle-orm';
import z from 'zod';
import unit from './unit/router';

// How many units the complex holds and how many of them stand vacant, counted on the list
// query itself rather than by a query per row. The join is a left one, so a complex with no
// units still arrives with a row and two zeroes.
//
// One expression each, selected under an alias and ordered by directly: written twice, the
// column the list sorts on could come to differ from the number its rows show.
const unitCount = sql<number>`count(${s.unit.id})`;
const vacantUnitCount = sql<number>`coalesce(sum(case when ${s.unit.status} = 'vacant' then 1 else 0 end), 0)`;

// every field a complex can be found by, whether or not the row shows it — a field dropped
// from a surface is never dropped from search. One list, so the directory and the palette
// answer the same term with the same rows.
const COMPLEX_SEARCH_COLUMNS: readonly (SQL | AnyColumn)[] = [s.complex.name, s.complex.location];

const COMPLEX_SORT_COLUMNS: Record<ComplexSortColumnId, SQL | AnyColumn> = {
	name: s.complex.name,
	location: s.complex.location,
	unitCount,
	vacantUnitCount
};

// the units a complex is created with: a name, and optionally the identity a unit already had,
// so undoing the creation and applying it again puts the same units back. Everything else about
// a unit is derived or is the complex being created.
const ComplexCreateSchema = ComplexSchema.partial({ id: true }).extend({
	units: z.array(UnitSchema.pick({ name: true }).extend({ id: z.string().optional() })).optional()
});

// a complex being put back, with the units it was deleted with as the rows they were. The unit's
// complex is the one it arrives under, so it is not given twice.
const ComplexRestoreSchema = ComplexSchema.partial({ id: true }).extend({
	units: z.array(UnitSchema.omit({ complexId: true })).optional()
});

const ComplexSortSchema = z.object({
	columnId: z.enum(COMPLEX_SORT_COLUMN_IDS),
	direction: z.enum(['asc', 'desc'])
});

/**
 * Ties fall back to the directory's own order — name, then id.
 *
 * A location is shared by every complex in one city and a count by most of them, so
 * ordering by either alone leaves the screen tied; breaking those by id would show a page
 * in insertion order, which reads as no order at all. The id is still last because a name
 * is unique today only by a constraint the order cannot see.
 */
function complexOrderBy(
	chosenSort: z.infer<typeof ComplexSortSchema> | undefined,
	viewsUnit: boolean
): SQL[] {
	const directoryOrder = [asc(s.complex.name), asc(s.complex.id)];
	// a member who may not view units is not ordered by how many a complex holds, which would be
	// the count told another way (effort 838, requirement 10).
	const countsUnits =
		chosenSort?.columnId === 'unitCount' || chosenSort?.columnId === 'vacantUnitCount';
	const sort = countsUnits && !viewsUnit ? undefined : chosenSort;

	if (!sort) {
		return directoryOrder;
	}

	const column = COMPLEX_SORT_COLUMNS[sort.columnId];
	const chosen = sort.direction === 'asc' ? asc(column) : desc(column);

	return sort.columnId === 'name' ? [chosen, asc(s.complex.id)] : [chosen, ...directoryOrder];
}

/**
 * What deleting a whole selection of complexes would do, from one read of the workspace.
 *
 * **The plan and the mutation are the same call.** `complex.planMany` and `complex.deleteMany`
 * both go through this, so the confirmation shows what the deletion is about to decide rather
 * than a second opinion about it. They can still disagree about the *workspace*, because another
 * device may write between the two, and that is why the mutation runs this again instead of
 * trusting what the reader was shown.
 *
 * One read per table for the whole selection, never one per record. Everything after the two
 * reads is `planSelection`'s, which is where the tenant's and the unit's plans go too.
 *
 * @param permitted whether the reader holds a flag: a complex with units is refused to one who may
 * not delete units, and one with none is not.
 * @returns the plan, and how many units go with the complexes it would delete, which is what the
 * confirmation names beside them.
 */
async function planComplexSelection(
	db: Database,
	ids: readonly string[],
	permitted: (flag: RecordFlag) => boolean
) {
	const named = [...new Set(ids)];

	const records = await db.select().from(s.complex).where(inArray(s.complex.id, named));
	const held = await readUnitHolds(db, named);

	const plan = planSelection({
		ids: named,
		records,
		dependants: held,
		ownerOf: (hold) => hold.complexId,
		nameOf: (complex) => complex.name,
		whatRefuses: (complexHeld) => refusalFromHolds(complexHeld, permitted)
	});
	const eligibleIds = new Set(plan.eligible.map((complex) => complex.id));
	const units = new Set(
		held.filter((hold) => eligibleIds.has(hold.complexId)).map((hold) => hold.unitId)
	);

	return { ...plan, units: units.size };
}

/**
 * The units of the complexes named, one row for each contract holding one and one with no
 * contract for a unit nothing holds: the one read every question about deleting a complex turns
 * on. A left join, so a unit no contract ever named still arrives, and no more than the three
 * identities, so a directory of five hundred selected complexes never carries their units.
 */
async function readUnitHolds(db: Database, complexIds: readonly string[]) {
	return await db
		.select({
			complexId: s.unit.complexId,
			unitId: s.unit.id,
			contractId: s.contractUnit.contractId
		})
		.from(s.unit)
		.leftJoin(s.contractUnit, eq(s.contractUnit.unitId, s.unit.id))
		.where(inArray(s.unit.complexId, [...complexIds]));
}

type UnitHold = Awaited<ReturnType<typeof readUnitHolds>>[number];

/** One complex's units, and every contract's hold on them, out of its rows of {@link readUnitHolds}. */
function toUnitsAndAssignments(held: readonly UnitHold[]) {
	return {
		units: [...new Set(held.map((hold) => hold.unitId))],
		assignments: held.filter((hold) => hold.contractId !== null)
	};
}

/** Why deleting one complex would be refused, from its rows of {@link readUnitHolds}. */
function refusalFromHolds(held: UnitHold[], permitted: (flag: RecordFlag) => boolean) {
	const { units, assignments } = toUnitsAndAssignments(held);

	return whatRefusesComplexDeletion(units, assignments, permitted);
}

export default router({
	/**
	 * Create a complex, and the units it was entered for, in one write.
	 *
	 * The units are optional and the complex still arrives alone where none are given. Where
	 * some are, the complex and every unit go down as one batch — the boundary runs a batch
	 * inside a transaction — so a refusal anywhere creates nothing, including the complex
	 * (ADR 0027).
	 *
	 * The id is optional and almost always absent, so undoing a deletion can put the row back
	 * with the identity it had (ADR 0026).
	 */
	create: procedure
		.permitted('createComplex')
		.use(autosync())
		.input(ComplexCreateSchema)
		.mutation(async ({ input, ctx }) => {
			const { units = [], ...complex } = input;

			// the units go down as units, so a complex entered with some is adding units too.
			if (units.length > 0) refuseMissing(ctx.identity, ['createUnit']);

			ensureIdFree(
				complex.id === undefined
					? undefined
					: await ctx.db.select().from(s.complex).where(eq(s.complex.id, complex.id)).get()
			);

			ensureComplexNameAvailable((await complexesNamed(ctx.db, [complex.name]))[0]);

			const named = units.map((unit) => ({ ...unit, name: unit.name.trim() }));

			ensureUnitNamesDistinct(named.map((unit) => unit.name));

			for (const unit of named) {
				ensureIdFree(
					unit.id === undefined
						? undefined
						: await ctx.db.select().from(s.unit).where(eq(s.unit.id, unit.id)).get()
				);
			}

			const complexId = complex.id ?? newId();

			if (named.length === 0) {
				const created = await ctx.db
					.insert(s.complex)
					.values({ ...complex, id: complexId })
					.returning()
					.get();

				return { ...created, units: [] as (typeof s.unit.$inferSelect)[] };
			}

			const [[created], ...createdUnits] = await ctx.db.batch([
				ctx.db
					.insert(s.complex)
					.values({ ...complex, id: complexId })
					.returning(),
				...named.map((unit) =>
					ctx.db
						.insert(s.unit)
						.values({ ...unit, id: unit.id ?? newId(), complexId, status: 'vacant' })
						.returning()
				)
			]);

			return { ...created, units: createdUnits.map(([unit]) => unit) };
		}),

	update: procedure
		.permitted('editComplex')
		.use(autosync())
		.input(ComplexSchema.partial({ name: true, location: true }))
		.mutation(async ({ input, ctx }) => {
			// presence, not truthiness: the schema admits '' for name. Only a name this edit
			// changes is checked: two complexes may already share one, saved apart on two
			// machines (effort 857, ticket 38), and each stays editable.
			const current = await ctx.db
				.select({ name: s.complex.name })
				.from(s.complex)
				.where(eq(s.complex.id, input.id))
				.get();
			const renamed =
				input.name !== undefined && input.name !== current?.name ? input.name : undefined;

			ensureComplexNameAvailable(
				renamed !== undefined ? (await complexesNamed(ctx.db, [renamed], input.id))[0] : null
			);

			const values = {
				...(input.name !== undefined ? { name: input.name } : {}),
				...(input.location !== undefined ? { location: input.location } : {})
			};

			// Drizzle refuses an empty set clause. An update naming no field means "change
			// nothing" rather than a bad request, so it reads back instead of writing.
			if (Object.keys(values).length === 0) {
				return ensureComplexStillExists(
					await ctx.db.select().from(s.complex).where(eq(s.complex.id, input.id)).get()
				);
			}

			const updated = await ctx.db
				.update(s.complex)
				.set(values)
				.where(eq(s.complex.id, input.id))
				.returning()
				.get();

			return ensureComplexStillExists(updated);
		}),

	/**
	 * Delete a complex, and the units it has, in one write.
	 *
	 * Refused where any contract, of any status, holds one of its units, and, where it has units,
	 * to a reader who may not delete them. Where it has some, the complex and its units go as one
	 * batch, so a refusal anywhere removes nothing (ADR 0027). It answers with every row it
	 * removed, so undoing it can put each back as it was (ADR 0026).
	 */
	delete: procedure
		.permitted('deleteComplex')
		.use(autosync())
		.input(ComplexSchema.pick({ id: true }))
		.mutation(async ({ input, ctx }) => {
			const { units, assignments } = toUnitsAndAssignments(await readUnitHolds(ctx.db, [input.id]));

			ensureComplexDeletable(assignments);
			// the units go with it, so a complex that has any is deleting units too.
			refuseMissing(ctx.identity, flagsToDeleteUnitsOf(units));

			if (units.length === 0) {
				const deleted = await ctx.db
					.delete(s.complex)
					.where(eq(s.complex.id, input.id))
					.returning()
					.get();

				// a complex somebody else deleted first is refused rather than answered with nothing,
				// which read as success: to an undo of its creation, and to a deletion of what is gone.
				return {
					...ensureComplexStillExists(deleted),
					units: [] as (typeof s.unit.$inferSelect)[]
				};
			}

			const [[deleted], deletedUnits] = await ctx.db.batch([
				ctx.db.delete(s.complex).where(eq(s.complex.id, input.id)).returning(),
				ctx.db.delete(s.unit).where(eq(s.unit.complexId, input.id)).returning()
			]);

			return { ...ensureComplexStillExists(deleted), units: deletedUnits };
		}),

	/**
	 * What deleting the complexes named would do, before any of it is done.
	 *
	 * Asked of the workspace rather than read off the rows, even though a directory row carries
	 * `unitCount` and could answer. An application that plans some of its actions from the row and
	 * the rest from a query has two answers to one question, which is what the effort behind this
	 * exists to remove.
	 *
	 * A query rather than a mutation: it reads and writes nothing. The complex's host asks it of one
	 * complex too, so its delete dialog says what the deletion will decide.
	 *
	 * `units` counts those that would go with the complexes it would delete. Only a reader who may
	 * delete units is let delete a complex that has any, and deleting them needs viewing them, so
	 * the count is never one of units the reader may not view.
	 */
	planMany: procedure
		.permitted('viewComplex')
		.input(z.object({ ids: z.array(ComplexSchema.shape.id).min(1) }))
		.query(async ({ input, ctx }) => {
			const plan = await planComplexSelection(ctx.db, input.ids, (flag) =>
				permits(ctx.identity.permissions, flag)
			);

			return {
				eligible: plan.eligible.map((complex) => complex.id),
				refused: plan.refused,
				units: plan.units
			};
		}),

	/**
	 * Delete every complex named that no contract's hold on a unit refuses, with its units, and say
	 * which of them could not be.
	 *
	 * **One delete over the whole set, not one per record**, and one over their units, in one
	 * batch. A selection is one thing the reader asked for, and issuing it as N calls costs a round
	 * trip and a sync pass per record for work one statement does.
	 *
	 * **No reconcile pass.** A complex carries nothing derived, and the units that go with it are
	 * held by no contract, so no contract's derived state named them and nothing derived was
	 * resting on either. That is the same reason the single-record deletion above runs none.
	 */
	deleteMany: procedure
		.permitted('deleteComplex')
		.use(autosync())
		.input(z.object({ ids: z.array(ComplexSchema.shape.id).min(1) }))
		.mutation(async ({ input, ctx }) => {
			const plan = await planComplexSelection(ctx.db, input.ids, (flag) =>
				permits(ctx.identity.permissions, flag)
			);
			const deletableIds = plan.eligible.map((complex) => complex.id);

			if (deletableIds.length === 0) {
				return { deleted: [], refused: plan.refused };
			}

			const [, deletedUnits] = await ctx.db.batch([
				ctx.db.delete(s.complex).where(inArray(s.complex.id, deletableIds)),
				ctx.db.delete(s.unit).where(inArray(s.unit.complexId, deletableIds)).returning()
			]);

			return {
				deleted: plan.eligible.map((complex) => ({
					...complex,
					units: deletedUnits.filter((unit) => unit.complexId === complex.id)
				})),
				refused: plan.refused
			};
		}),

	/**
	 * Put a set of complexes back, all of them or none.
	 *
	 * What undoing {@link deleteMany} calls, and the reason it is all or nothing: a set half
	 * restored leaves the workspace in a shape neither the deletion nor the undo describes. One
	 * batch, and the boundary runs a batch inside one transaction (ADR 0027), so a refusal
	 * anywhere in the set creates nothing.
	 *
	 * **It throws rather than reporting**, which is what leaves the entry on the undo stack: an
	 * inverse that threw did not move the workspace, so the reader can deal with whatever refused
	 * it and press undo again. Every refusal names the complex it is about.
	 *
	 * **The units a deletion took go back with their complex, as they were**: every column the row
	 * had, its status included, rather than what {@link create} would derive for a new one. It is
	 * also what undoing {@link delete} calls for a complex that took units with it.
	 */
	createMany: procedure
		.permitted('createComplex')
		.use(autosync())
		.input(z.object({ complexes: z.array(ComplexRestoreSchema).min(1) }))
		.mutation(async ({ input, ctx }) => {
			const named = input.complexes.map(({ units = [], ...complex }) => ({
				complex: { ...complex, id: complex.id ?? newId() },
				units
			}));
			const ids = named.map(({ complex }) => complex.id);
			const names = named.map(({ complex }) => complex.name);
			const units = named.flatMap(({ complex, units }) =>
				units.map((unit) => ({ ...unit, complexId: complex.id }))
			);
			const unitIds = units.map((unit) => unit.id);

			// the units go back as units, so a set putting any back is adding units too.
			if (units.length > 0) refuseMissing(ctx.identity, ['createUnit']);

			// the set against itself, on both things a complex is unique by, before it is weighed
			// against the workspace at all. A set that contradicts itself is a contradiction the
			// engine would only report part-way through, and this write is meant to land whole or
			// not at all.
			const repeated =
				ids.find((id, index) => ids.indexOf(id) !== index) ??
				names.find((name, index) => names.indexOf(name) !== index);

			if (repeated) {
				throw refuse('complex.repeatedInSet', { value: repeated });
			}

			const repeatedUnit = unitIds.find((id, index) => unitIds.indexOf(id) !== index);

			if (repeatedUnit) {
				throw refuse('unit.repeatedInSet', { value: repeatedUnit });
			}

			const held = await ctx.db.select().from(s.complex).where(inArray(s.complex.id, ids));

			ensureIdFree(held[0], held[0]?.id);

			const taken = await complexesNamed(ctx.db, names);

			ensureComplexNameAvailable(taken[0], taken[0]?.name);

			const heldUnits =
				unitIds.length > 0
					? await ctx.db.select().from(s.unit).where(inArray(s.unit.id, unitIds))
					: [];

			ensureIdFree(heldUnits[0], heldUnits[0]?.id);

			const [first, ...rest] = [
				...named.map(({ complex }) => ctx.db.insert(s.complex).values(complex).returning()),
				...units.map((unit) => ctx.db.insert(s.unit).values(unit).returning())
			];
			const created = await ctx.db.batch([first, ...rest]);

			// the complexes first, in the order they were named; the units after them are what went
			// back with them.
			return created.slice(0, named.length).map(([complex]) => complex);
		}),

	get: procedure
		.permitted('viewComplex')
		.input(ComplexSchema.pick({ id: true }))
		.query(async ({ input, ctx }) => {
			return await ctx.db.select().from(s.complex).where(eq(s.complex.id, input.id)).get();
		}),

	/** The complexes a palette search reaches, by name or location. */
	search: procedure
		.permitted('viewComplex')
		.input(RecordSearchSchema)
		.query(async ({ input, ctx }): Promise<RecordMatch[]> => {
			return await ctx.db
				.select({ id: s.complex.id, label: s.complex.name, hint: s.complex.location })
				.from(s.complex)
				.where(matchesAnySearch(COMPLEX_SEARCH_COLUMNS, input.term))
				.orderBy(asc(s.complex.name), asc(s.complex.id))
				.limit(input.limit);
		}),

	getMany: procedure
		.permitted('viewComplex')
		.input(
			z.object({
				search: z.string().optional(),
				sort: ComplexSortSchema.optional()
			})
		)
		.query(async ({ input, ctx }) => {
			const search = input.search?.trim();
			// a row counts its units only for a member who may view units (effort 838, requirement 10).
			const viewsUnit = permits(ctx.identity.permissions, 'viewUnit');

			const complexes = await ctx.db
				.select({
					id: s.complex.id,
					name: s.complex.name,
					location: s.complex.location,
					unitCount: unitCount.as('unitCount'),
					vacantUnitCount: vacantUnitCount.as('vacantUnitCount')
				})
				.from(s.complex)
				.leftJoin(s.unit, eq(s.unit.complexId, s.complex.id))
				.where(search ? matchesAnySearch(COMPLEX_SEARCH_COLUMNS, search) : undefined)
				.groupBy(s.complex.id)
				.orderBy(...complexOrderBy(input.sort, viewsUnit));

			return complexes.map(({ unitCount, vacantUnitCount, ...complex }) => ({
				...complex,
				...(viewsUnit ? { unitCount, vacantUnitCount } : {})
			}));
		}),

	// a unit is reached only through its complex, so its procedures are served here (`unit/router.ts`).
	units: unit
});
