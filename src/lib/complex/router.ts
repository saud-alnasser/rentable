import type { Context } from '$lib/api/context';
import { ensureIdFree } from '$lib/platform/database/identity';
import * as s from '$lib/platform/database/schema';
import { ComplexSchema, UnitSchema } from '$lib/platform/database/schema';
import { autosync, procedure, router } from '$lib/api/trpc';
import { addUtcDays, toUtcDay, type DateLike } from '$lib/api/date';
import {
	COMPLEX_SORT_COLUMN_IDS,
	ensureUnitNamesDistinct,
	type ComplexSortColumnId
} from '$lib/complex/complex';
import { CONTRACT_OCCUPYING_STATUSES, deriveUnitStatuses } from '$lib/contract/contract';
import { groupPaymentsByContractId } from '$lib/payment/payment';
import { TRPCError } from '@trpc/server';
import {
	and,
	asc,
	desc,
	eq,
	gte,
	inArray,
	like,
	lt,
	or,
	sql,
	type AnyColumn,
	type SQL
} from 'drizzle-orm';
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
	units: z.array(UnitSchema.pick({ name: true }).extend({ id: z.number().optional() })).optional()
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
	create: procedure.public
		.use(autosync())
		.input(ComplexCreateSchema)
		.mutation(async ({ input, ctx }) => {
			const { units = [], ...complex } = input;

			ensureIdFree(
				complex.id === undefined
					? undefined
					: await ctx.db.select().from(s.complex).where(eq(s.complex.id, complex.id)).get()
			);

			const isNameUsed = await ctx.db
				.select()
				.from(s.complex)
				.where(eq(s.complex.name, complex.name))
				.get();

			if (isNameUsed) {
				throw new TRPCError({
					code: 'BAD_REQUEST',
					message: 'name is associated with a previously registered complex'
				});
			}

			const named = units.map((unit) => ({ ...unit, name: unit.name.trim() }));

			ensureUnitNamesDistinct(named.map((unit) => unit.name));

			for (const unit of named) {
				ensureIdFree(
					unit.id === undefined
						? undefined
						: await ctx.db.select().from(s.unit).where(eq(s.unit.id, unit.id)).get()
				);
			}

			if (named.length === 0) {
				const created = await ctx.db.insert(s.complex).values(complex).returning().get();

				return { ...created, units: [] as (typeof s.unit.$inferSelect)[] };
			}

			// the units name their complex by its own name rather than by an id: the batch is
			// built before any of it runs, so the identity the engine is about to assign is not
			// available to the statements that need it. The name is unique and was just checked.
			const complexId = ctx.db
				.select({ id: s.complex.id })
				.from(s.complex)
				.where(eq(s.complex.name, complex.name));

			const [[created], ...createdUnits] = await ctx.db.batch([
				ctx.db.insert(s.complex).values(complex).returning(),
				...named.map((unit) =>
					ctx.db
						.insert(s.unit)
						.values({ ...unit, complexId: sql`(${complexId})`, status: 'vacant' })
						.returning()
				)
			]);

			return { ...created, units: createdUnits.map(([unit]) => unit) };
		}),

	update: procedure.public
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
				return await ctx.db.select().from(s.complex).where(eq(s.complex.id, input.id)).get();
			}

			const updated = await ctx.db
				.update(s.complex)
				.set(values)
				.where(eq(s.complex.id, input.id))
				.returning()
				.get();

			return updated;
		}),

	delete: procedure.public
		.use(autosync())
		.input(ComplexSchema.pick({ id: true }))
		.mutation(async ({ input, ctx }) => {
			const units = await ctx.db.select().from(s.unit).where(eq(s.unit.complexId, input.id));

			if (units?.length > 0) {
				throw new TRPCError({
					code: 'BAD_REQUEST',
					message: 'cannot delete complex with associated units'
				});
			}

			const deleted = await ctx.db
				.delete(s.complex)
				.where(eq(s.complex.id, input.id))
				.returning()
				.get();

			return deleted;
		}),

	get: procedure.public.input(ComplexSchema.pick({ id: true })).query(async ({ input, ctx }) => {
		return await ctx.db.select().from(s.complex).where(eq(s.complex.id, input.id)).get();
	}),

	getMany: procedure.public
		.input(
			z.object({
				search: z.string().optional(),
				sort: ComplexSortSchema.optional()
			})
		)
		.query(async ({ input, ctx }) => {
			const search = input.search?.trim();
			const searchPattern = search ? `%${search}%` : undefined;

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
				.where(
					searchPattern
						? or(like(s.complex.name, searchPattern), like(s.complex.location, searchPattern))
						: undefined
				)
				.groupBy(s.complex.id)
				.orderBy(...complexOrderBy(input.sort));
		}),

	units: {
		// one unit, carrying the complex holding it: a unit is reached only through its complex,
		// so a view of one that could not name it would send the reader back to find out where
		// they are.
		get: procedure.public.input(UnitSchema.pick({ id: true })).query(async ({ input, ctx }) => {
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

		getMany: procedure.public
			.input(UnitSchema.pick({ complexId: true }).extend({ search: z.string().optional() }))
			.query(async ({ input, ctx }) => {
				const search = input.search?.trim();
				const searchPattern = search ? `%${search}%` : undefined;
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
							searchPattern
								? or(like(s.unit.name, searchPattern), like(tenantName, searchPattern))
								: undefined
						)
					)
					.orderBy(asc(s.unit.name), asc(s.unit.id));
			}),

		// an optional id, so undoing a deletion can put the row back with the identity it had — a
		// page still open on that record is holding a reference to it (ADR 0026). Absent
		// otherwise, and the engine assigns one.
		create: procedure.public
			.use(autosync())
			.input(UnitSchema.omit({ status: true }).partial({ id: true }))
			.mutation(async ({ input, ctx }) => {
				ensureIdFree(
					input.id === undefined
						? undefined
						: await ctx.db.select().from(s.unit).where(eq(s.unit.id, input.id)).get()
				);

				const isNameUsed = await ctx.db
					.select()
					.from(s.unit)
					.where(sql`${s.unit.name} = ${input.name} AND ${s.unit.complexId} == ${input.complexId}`)
					.get();

				if (isNameUsed) {
					throw new TRPCError({
						code: 'BAD_REQUEST',
						message: 'name is associated with a unit in the same complex'
					});
				}

				const created = await ctx.db
					.insert(s.unit)
					.values({
						...input,
						status: 'vacant'
					})
					.returning()
					.get();

				return created;
			}),

		update: procedure.public
			.use(autosync())
			.input(UnitSchema.partial({ name: true, status: true }))
			.mutation(async ({ input, ctx }) => {
				// presence, not truthiness: the schema admits '' for name, and a present value
				// must hit the uniqueness check exactly when the set clause would write it.
				const isNameUsed =
					input.name !== undefined
						? await ctx.db
								.select()
								.from(s.unit)
								.where(
									sql`${s.unit.name} = ${input.name} AND ${s.unit.complexId} == ${input.complexId} AND ${s.unit.id} != ${input.id}`
								)
								.get()
						: null;

				if (isNameUsed) {
					throw new TRPCError({
						code: 'BAD_REQUEST',
						message: 'name is associated with a unit in the same complex'
					});
				}

				const values = {
					...(input.name !== undefined ? { name: input.name } : {}),
					...(input.status !== undefined ? { status: input.status } : {})
				};

				// Drizzle refuses an empty set clause. An update naming no field means "change
				// nothing" rather than a bad request, so it reads back instead of writing.
				if (Object.keys(values).length === 0) {
					return await ctx.db.select().from(s.unit).where(eq(s.unit.id, input.id)).get();
				}

				const updated = await ctx.db
					.update(s.unit)
					.set(values)
					.where(eq(s.unit.id, input.id))
					.returning()
					.get();

				return updated;
			}),

		delete: procedure.public
			.use(autosync())
			.input(UnitSchema.pick({ id: true }))
			.mutation(async ({ input, ctx }) => {
				const contracts = await ctx.db
					.select()
					.from(s.contractUnit)
					.where(eq(s.contractUnit.unitId, input.id));

				if (contracts?.length > 0) {
					throw new TRPCError({
						code: 'BAD_REQUEST',
						message: 'cannot delete unit with associated contracts'
					});
				}

				const deleted = await ctx.db
					.delete(s.unit)
					.where(eq(s.unit.id, input.id))
					.returning()
					.get();

				return deleted;
			})
	}
});
