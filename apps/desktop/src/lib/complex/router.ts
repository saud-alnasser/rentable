import type { Context, Database } from '$lib/api/context';
import { RecordSearchSchema, type RecordMatch } from '$lib/api/search';
import { matchesAnySearch } from '$lib/platform/database/search';
import { ensureIdFree, newId } from '$lib/platform/database/identity';
import * as s from '$lib/platform/database/schema';
import { ComplexSchema, UnitSchema } from '$lib/platform/database/schema';
import { planSelection } from '$lib/api/selection';
import { autosync, procedure, router } from '$lib/api/trpc';
import { addUtcDays, toUtcDay, type DateLike } from '$lib/api/date';
import {
	COMPLEX_SORT_COLUMN_IDS,
	ensureComplexDeletable,
	ensureComplexNameAvailable,
	ensureComplexStillExists,
	ensureUnitDeletable,
	ensureUnitNameAvailable,
	ensureUnitNamesDistinct,
	ensureUnitStillExists,
	whatRefusesComplexDeletion,
	whatRefusesUnitDeletion,
	type ComplexSortColumnId
} from '$lib/complex/complex';
import { CONTRACT_OCCUPYING_STATUSES, deriveUnitStatuses } from '$lib/contract/contract';
import { groupPaymentsByContractId } from '$lib/payment/payment';
import { TRPCError } from '@trpc/server';
import { and, asc, desc, eq, gte, inArray, lt, sql, type AnyColumn, type SQL } from 'drizzle-orm';
import { QueryBuilder } from 'drizzle-orm/sqlite-core';
import z from 'zod';

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
function complexOrderBy(sort: z.infer<typeof ComplexSortSchema> | undefined): SQL[] {
	const directoryOrder = [asc(s.complex.name), asc(s.complex.id)];

	if (!sort) {
		return directoryOrder;
	}

	const column = COMPLEX_SORT_COLUMNS[sort.columnId];
	const chosen = sort.direction === 'asc' ? asc(column) : desc(column);

	return sort.columnId === 'name' ? [chosen, asc(s.complex.id)] : [chosen, ...directoryOrder];
}

/**
 * The name of the tenant occupying a unit today, or null where nobody is.
 *
 * The rule is `deriveUnitStatus`'s, expressed for the query rather than for a loaded row:
 * an assignment whose contract holds an occupying status and whose period covers today.
 * `limit 1` is what keeps one unit to one row — assignments cannot legally overlap, so the
 * subquery is choosing between rows that should not both exist rather than picking a
 * winner.
 */
function occupyingTenantName(now: DateLike) {
	const dayStart = toUtcDay(now);
	const dayEnd = addUtcDays(dayStart, 1);
	const occupant = new QueryBuilder()
		.select({ name: s.tenant.name })
		.from(s.contractUnit)
		.innerJoin(s.contract, eq(s.contract.id, s.contractUnit.contractId))
		.innerJoin(s.tenant, eq(s.tenant.id, s.contract.tenantId))
		.where(
			and(
				eq(s.contractUnit.unitId, s.unit.id),
				inArray(s.contract.status, CONTRACT_OCCUPYING_STATUSES),
				lt(s.contract.start, dayEnd),
				gte(s.contract.end, dayStart)
			)
		)
		.orderBy(desc(s.contract.start))
		.limit(1);

	return sql<string | null>`(${occupant})`;
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
 */
async function planComplexSelection(db: Database, ids: readonly string[]) {
	const named = [...new Set(ids)];

	const records = await db.select().from(s.complex).where(inArray(s.complex.id, named));

	// the complex each unit belongs to and nothing else: the rule asks whether any unit belongs
	// to the complex, so a directory of five hundred selected complexes never carries their units.
	const held = await db
		.select({ complexId: s.unit.complexId })
		.from(s.unit)
		.where(inArray(s.unit.complexId, named));

	return planSelection({
		ids: named,
		records,
		dependants: held,
		ownerOf: (unit) => unit.complexId,
		nameOf: (complex) => complex.name,
		whatRefuses: whatRefusesComplexDeletion
	});
}

/**
 * The same, one level down, for a selection of units.
 *
 * **Every assignment counts, and this is the case that decided the whole approach.** A unit is
 * refused for holding any assignment ever, and its row carries `status`, where `vacant` says
 * only that no assignment is current. A unit whose only contract starts next month is vacant on
 * screen and undeletable, so a confirmation built from the rows would have offered to delete it
 * and then been refused.
 */
async function planUnitSelection(db: Database, ids: readonly string[]) {
	const named = [...new Set(ids)];

	const records = await db.select().from(s.unit).where(inArray(s.unit.id, named));

	const held = await db
		.select({ unitId: s.contractUnit.unitId })
		.from(s.contractUnit)
		.where(inArray(s.contractUnit.unitId, named));

	return planSelection({
		ids: named,
		records,
		dependants: held,
		ownerOf: (assignment) => assignment.unitId,
		nameOf: (unit) => unit.name,
		whatRefuses: whatRefusesUnitDeletion
	});
}

/**
 * A unit name as its uniqueness is actually scoped: within the complex holding it.
 *
 * Two complexes may each hold an *A1*, so a set of bare names answers the wrong question. The
 * separator is a character no name can contain.
 */
const withinComplex = (unit: { complexId: string; name: string }) =>
	`${unit.complexId}\u0000${unit.name}`;

async function getUnitsWithDerivedStatus(
	ctx: Pick<Context, 'db' | 'clock'>,
	units: (typeof s.unit.$inferSelect)[]
) {
	const unitIds = units.map((unit) => unit.id);

	if (unitIds.length === 0) {
		return units;
	}

	const assignments = await ctx.db
		.select({
			unitId: s.contractUnit.unitId,
			contractId: s.contract.id,
			status: s.contract.status,
			start: s.contract.start,
			end: s.contract.end,
			interval: s.contract.interval,
			cost: s.contract.cost
		})
		.from(s.contractUnit)
		.innerJoin(s.contract, eq(s.contractUnit.contractId, s.contract.id))
		.where(inArray(s.contractUnit.unitId, unitIds));

	const contractIds = [...new Set(assignments.map((assignment) => assignment.contractId))];
	const payments = contractIds.length
		? await ctx.db.select().from(s.payment).where(inArray(s.payment.contractId, contractIds))
		: [];
	const statusByUnitId = deriveUnitStatuses(
		unitIds,
		assignments,
		groupPaymentsByContractId(payments),
		ctx.clock.now()
	);

	return units.map((unit) => ({
		...unit,
		status: statusByUnitId.get(unit.id) ?? 'vacant'
	}));
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
	create: procedure.member
		.use(autosync())
		.input(ComplexCreateSchema)
		.mutation(async ({ input, ctx }) => {
			const { units = [], ...complex } = input;

			ensureIdFree(
				complex.id === undefined
					? undefined
					: await ctx.db.select().from(s.complex).where(eq(s.complex.id, complex.id)).get()
			);

			ensureComplexNameAvailable(
				await ctx.db.select().from(s.complex).where(eq(s.complex.name, complex.name)).get()
			);

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

	update: procedure.member
		.use(autosync())
		.input(ComplexSchema.partial({ name: true, location: true }))
		.mutation(async ({ input, ctx }) => {
			// presence, not truthiness: the schema admits '' for name, and a present value
			// must hit the uniqueness check exactly when the set clause would write it.
			const isNameUsed =
				input.name !== undefined
					? await ctx.db
							.select()
							.from(s.complex)
							.where(sql`${s.complex.name} = ${input.name} AND ${s.complex.id} != ${input.id}`)
							.get()
					: null;

			if (isNameUsed) {
				throw new TRPCError({
					code: 'BAD_REQUEST',
					message: 'name is associated with a previously registered complex'
				});
			}

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

	delete: procedure.member
		.use(autosync())
		.input(ComplexSchema.pick({ id: true }))
		.mutation(async ({ input, ctx }) => {
			ensureComplexDeletable(
				await ctx.db.select().from(s.unit).where(eq(s.unit.complexId, input.id))
			);

			const deleted = await ctx.db
				.delete(s.complex)
				.where(eq(s.complex.id, input.id))
				.returning()
				.get();

			return deleted;
		}),

	/**
	 * What deleting the complexes named would do, before any of it is done.
	 *
	 * Asked of the workspace rather than read off the rows, even though a directory row carries
	 * `unitCount` and could answer. An application that plans some of its actions from the row and
	 * the rest from a query has two answers to one question, which is what the effort behind this
	 * exists to remove.
	 *
	 * A query rather than a mutation: it reads and writes nothing.
	 */
	planMany: procedure.member
		.input(z.object({ ids: z.array(ComplexSchema.shape.id).min(1) }))
		.query(async ({ input, ctx }) => {
			const plan = await planComplexSelection(ctx.db, input.ids);

			return { eligible: plan.eligible.map((complex) => complex.id), refused: plan.refused };
		}),

	/**
	 * Delete every complex named that holds no unit, and say which of them could not be.
	 *
	 * **One delete over the whole set, not one per record.** A selection is one thing the reader
	 * asked for, and issuing it as N calls costs a round trip and a sync pass per record for work
	 * one statement does.
	 *
	 * **No reconcile pass.** A complex carries nothing derived, and one that may be deleted at all
	 * holds no unit, so nothing derived was resting on it either. That is the same reason the
	 * single-record deletion above runs none.
	 */
	deleteMany: procedure.member
		.use(autosync())
		.input(z.object({ ids: z.array(ComplexSchema.shape.id).min(1) }))
		.mutation(async ({ input, ctx }) => {
			const plan = await planComplexSelection(ctx.db, input.ids);
			const deletableIds = plan.eligible.map((complex) => complex.id);

			if (deletableIds.length) {
				await ctx.db.delete(s.complex).where(inArray(s.complex.id, deletableIds));
			}

			return { deleted: plan.eligible, refused: plan.refused };
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
	 * No units, unlike {@link create}: a complex that could be deleted held none, so a complex
	 * this puts back has none to put back with it.
	 */
	createMany: procedure.member
		.use(autosync())
		.input(z.object({ complexes: z.array(ComplexSchema.partial({ id: true })).min(1) }))
		.mutation(async ({ input, ctx }) => {
			const named = input.complexes.map((complex) => ({ ...complex, id: complex.id ?? newId() }));
			const ids = named.map((complex) => complex.id);
			const names = named.map((complex) => complex.name);

			// the set against itself, on both things a complex is unique by, before it is weighed
			// against the workspace at all. A set that contradicts itself is a contradiction the
			// engine would only report part-way through, and this write is meant to land whole or
			// not at all.
			const repeated =
				ids.find((id, index) => ids.indexOf(id) !== index) ??
				names.find((name, index) => names.indexOf(name) !== index);

			if (repeated) {
				throw new TRPCError({
					code: 'BAD_REQUEST',
					message: `two complexes in this set claim ${repeated}`
				});
			}

			const held = await ctx.db.select().from(s.complex).where(inArray(s.complex.id, ids));

			ensureIdFree(held[0], held[0]?.id);

			const taken = await ctx.db.select().from(s.complex).where(inArray(s.complex.name, names));

			ensureComplexNameAvailable(taken[0], taken[0]?.name);

			const [first, ...rest] = named.map((complex) =>
				ctx.db.insert(s.complex).values(complex).returning()
			);
			const created = await ctx.db.batch([first, ...rest]);

			return created.map(([complex]) => complex);
		}),

	get: procedure.member.input(ComplexSchema.pick({ id: true })).query(async ({ input, ctx }) => {
		return await ctx.db.select().from(s.complex).where(eq(s.complex.id, input.id)).get();
	}),

	/** The complexes a palette search reaches, by name or location. */
	search: procedure.member
		.input(RecordSearchSchema)
		.query(async ({ input, ctx }): Promise<RecordMatch[]> => {
			return await ctx.db
				.select({ id: s.complex.id, label: s.complex.name, hint: s.complex.location })
				.from(s.complex)
				.where(matchesAnySearch(COMPLEX_SEARCH_COLUMNS, input.term))
				.orderBy(asc(s.complex.name), asc(s.complex.id))
				.limit(input.limit);
		}),

	getMany: procedure.member
		.input(
			z.object({
				search: z.string().optional(),
				sort: ComplexSortSchema.optional()
			})
		)
		.query(async ({ input, ctx }) => {
			const search = input.search?.trim();

			return await ctx.db
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
				.orderBy(...complexOrderBy(input.sort));
		}),

	units: {
		// one unit, carrying the complex holding it: a unit is reached only through its complex,
		// so a view of one that could not name it would send the reader back to find out where
		// they are.
		get: procedure.member.input(UnitSchema.pick({ id: true })).query(async ({ input, ctx }) => {
			const unit = await ctx.db
				.select({
					id: s.unit.id,
					name: s.unit.name,
					complexId: s.unit.complexId,
					status: s.unit.status,
					complexName: s.complex.name
				})
				.from(s.unit)
				.innerJoin(s.complex, eq(s.unit.complexId, s.complex.id))
				.where(eq(s.unit.id, input.id))
				.get();

			if (!unit) {
				return undefined;
			}

			const [withStatus] = await getUnitsWithDerivedStatus(ctx, [unit]);

			return { ...unit, status: withStatus?.status ?? unit.status };
		}),

		/** The units a palette search reaches, by their own name or the complex holding them. */
		search: procedure.member
			.input(RecordSearchSchema)
			.query(async ({ input, ctx }): Promise<RecordMatch[]> => {
				return await ctx.db
					.select({ id: s.unit.id, label: s.unit.name, hint: s.complex.name })
					.from(s.unit)
					.innerJoin(s.complex, eq(s.unit.complexId, s.complex.id))
					.where(matchesAnySearch([s.unit.name, s.complex.name], input.term))
					.orderBy(asc(s.complex.name), asc(s.unit.name), asc(s.unit.id))
					.limit(input.limit);
			}),

		getMany: procedure.member
			.input(UnitSchema.pick({ complexId: true }).extend({ search: z.string().optional() }))
			.query(async ({ input, ctx }) => {
				const search = input.search?.trim();
				const tenantName = occupyingTenantName(ctx.clock.now());

				// the board has one order and no control over it, so the search narrows what it
				// holds and never rearranges it.
				return await ctx.db
					.select({
						id: s.unit.id,
						name: s.unit.name,
						complexId: s.unit.complexId,
						status: s.unit.status,
						tenantName: tenantName.as('tenantName')
					})
					.from(s.unit)
					.where(
						and(
							eq(s.unit.complexId, input.complexId),
							search ? matchesAnySearch([s.unit.name, tenantName], search) : undefined
						)
					)
					.orderBy(asc(s.unit.name), asc(s.unit.id));
			}),

		// an optional id, so undoing a deletion can put the row back with the identity it had — a
		// page still open on that record is holding a reference to it (ADR 0026). Absent
		// otherwise, and the engine assigns one.
		create: procedure.member
			.use(autosync())
			.input(UnitSchema.omit({ status: true }).partial({ id: true }))
			.mutation(async ({ input, ctx }) => {
				ensureIdFree(
					input.id === undefined
						? undefined
						: await ctx.db.select().from(s.unit).where(eq(s.unit.id, input.id)).get()
				);

				ensureUnitNameAvailable(
					await ctx.db
						.select()
						.from(s.unit)
						.where(
							sql`${s.unit.name} = ${input.name} AND ${s.unit.complexId} == ${input.complexId}`
						)
						.get()
				);

				const created = await ctx.db
					.insert(s.unit)
					.values({
						...input,
						id: input.id ?? newId(),
						status: 'vacant'
					})
					.returning()
					.get();

				return created;
			}),

		update: procedure.member
			.use(autosync())
			.input(UnitSchema.partial({ name: true, status: true }))
			.mutation(async ({ input, ctx }) => {
				// presence, not truthiness: the schema admits '' for name, and a present value
				// must hit the uniqueness check exactly when the set clause would write it.
				ensureUnitNameAvailable(
					input.name !== undefined
						? await ctx.db
								.select()
								.from(s.unit)
								.where(
									sql`${s.unit.name} = ${input.name} AND ${s.unit.complexId} == ${input.complexId} AND ${s.unit.id} != ${input.id}`
								)
								.get()
						: null
				);

				const values = {
					...(input.name !== undefined ? { name: input.name } : {}),
					...(input.status !== undefined ? { status: input.status } : {})
				};

				// Drizzle refuses an empty set clause. An update naming no field means "change
				// nothing" rather than a bad request, so it reads back instead of writing.
				if (Object.keys(values).length === 0) {
					return ensureUnitStillExists(
						await ctx.db.select().from(s.unit).where(eq(s.unit.id, input.id)).get()
					);
				}

				const updated = await ctx.db
					.update(s.unit)
					.set(values)
					.where(eq(s.unit.id, input.id))
					.returning()
					.get();

				return ensureUnitStillExists(updated);
			}),

		delete: procedure.member
			.use(autosync())
			.input(UnitSchema.pick({ id: true }))
			.mutation(async ({ input, ctx }) => {
				ensureUnitDeletable(
					await ctx.db.select().from(s.contractUnit).where(eq(s.contractUnit.unitId, input.id))
				);

				const deleted = await ctx.db
					.delete(s.unit)
					.where(eq(s.unit.id, input.id))
					.returning()
					.get();

				return deleted;
			}),

		/**
		 * What deleting the units named would do, before any of it is done.
		 *
		 * **This is the reading no row can replace.** A unit is refused for holding any assignment
		 * ever, and its row carries a status derived from what holds it *today*, so a unit with a
		 * contract starting next month shows as vacant and cannot be deleted. The spec settled on
		 * plan queries rather than previewing from rows on exactly this case.
		 *
		 * A query rather than a mutation: it reads and writes nothing.
		 */
		planMany: procedure.member
			.input(z.object({ ids: z.array(UnitSchema.shape.id).min(1) }))
			.query(async ({ input, ctx }) => {
				const plan = await planUnitSelection(ctx.db, input.ids);

				return { eligible: plan.eligible.map((unit) => unit.id), refused: plan.refused };
			}),

		/**
		 * Delete every unit named that no contract has ever held, and say which could not be.
		 *
		 * **One delete over the whole set, not one per record**, for the reason the complex half
		 * above gives.
		 *
		 * **No reconcile pass, and nothing writes a status here.** A unit that may be deleted at
		 * all has never been assigned, so no contract's derived state named it and no other unit's
		 * did either. Occupancy moves through reconciliation alone, and this mutation gives it
		 * nothing to move: what it removed was already outside every touch-set.
		 */
		deleteMany: procedure.member
			.use(autosync())
			.input(z.object({ ids: z.array(UnitSchema.shape.id).min(1) }))
			.mutation(async ({ input, ctx }) => {
				const plan = await planUnitSelection(ctx.db, input.ids);
				const deletableIds = plan.eligible.map((unit) => unit.id);

				if (deletableIds.length) {
					await ctx.db.delete(s.unit).where(inArray(s.unit.id, deletableIds));
				}

				return { deleted: plan.eligible, refused: plan.refused };
			}),

		/**
		 * Put a set of units back, all of them or none.
		 *
		 * What undoing {@link deleteMany} calls; see the complex's own for why it is all or
		 * nothing and why it throws rather than reporting.
		 *
		 * **The status is set rather than restored**, exactly as the single-record creation does
		 * it: a unit that could be deleted had never been assigned, so `vacant` is not a default
		 * standing in for what it was; it is what it was.
		 */
		createMany: procedure.member
			.use(autosync())
			.input(
				z.object({
					units: z.array(UnitSchema.omit({ status: true }).partial({ id: true })).min(1)
				})
			)
			.mutation(async ({ input, ctx }) => {
				// the name is not trimmed here, where the single-record creation beside it does not
				// trim either: putting a record back means putting it back as itself, and a restore
				// that tidied the name would hand back a unit the reader did not delete.
				const named = input.units.map((unit) => ({ ...unit, id: unit.id ?? newId() }));
				const ids = named.map((unit) => unit.id);

				const repeated = ids.find((id, index) => ids.indexOf(id) !== index);

				if (repeated) {
					throw new TRPCError({
						code: 'BAD_REQUEST',
						message: `two units in this set claim ${repeated}`
					});
				}

				// a unit's name is unique within its complex rather than across the workspace, so the
				// set is checked per complex. `ensureUnitNamesDistinct` reads one complex's worth.
				const byComplexId = new Map<string, string[]>();

				for (const unit of named) {
					const holding = byComplexId.get(unit.complexId) ?? [];

					holding.push(unit.name);
					byComplexId.set(unit.complexId, holding);
				}

				for (const names of byComplexId.values()) {
					ensureUnitNamesDistinct(names);
				}

				const held = await ctx.db.select().from(s.unit).where(inArray(s.unit.id, ids));

				ensureIdFree(held[0], held[0]?.id);

				// one read for the whole set: every unit already in any complex the set names, so
				// the collision is found here rather than one query per unit.
				const neighbours = await ctx.db
					.select({ name: s.unit.name, complexId: s.unit.complexId })
					.from(s.unit)
					.where(inArray(s.unit.complexId, [...byComplexId.keys()]));
				const takenNames = new Set(neighbours.map(withinComplex));
				const colliding = named.find((unit) => takenNames.has(withinComplex(unit)));

				ensureUnitNameAvailable(colliding, colliding?.name);

				const [first, ...rest] = named.map((unit) =>
					ctx.db
						.insert(s.unit)
						.values({ ...unit, status: 'vacant' })
						.returning()
				);
				const created = await ctx.db.batch([first, ...rest]);

				return created.map(([unit]) => unit);
			})
	}
});
