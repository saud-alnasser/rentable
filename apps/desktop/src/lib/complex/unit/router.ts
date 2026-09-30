import type { Contributed } from '$lib/api/contribution';
import type { Context, Database } from '$lib/api/context';
import {
	matchesAnySearch,
	RecordSearchSchema,
	type RecordMatch
} from '$lib/platform/database/search';
import { ensureIdFree } from '$lib/api/refusal';
import { newId } from '$lib/platform/database/identity';
import * as s from '$lib/platform/database/schema';
import { UnitSchema } from '$lib/platform/database/schema';
import { planSelection } from '$lib/api/selection';
import { refuse } from '$lib/api/refusal';
import { autosync, procedure, router } from '$lib/api/trpc';
import { addUtcDays, toUtcDay, type DateLike } from '$lib/date';
import {
	ensureUnitDeletable,
	ensureUnitNameAvailable,
	ensureUnitNamesDistinct,
	ensureUnitStillExists,
	whatRefusesUnitDeletion,
	UNIT_SORT_COLUMN_IDS,
	type UnitContributions,
	type UnitSortColumnId
} from '$lib/complex/complex';
import { permits } from '@rentable/workspace-permission';
import { and, asc, desc, eq, gte, inArray, lt, sql, type AnyColumn, type SQL } from 'drizzle-orm';
import { QueryBuilder } from 'drizzle-orm/sqlite-core';
import z from 'zod';

/**
 * THE UNITS' PROCEDURES
 *
 * a unit is reached only through the complex holding it, so its procedures are the complex's:
 * composed into the complex's router under `units`, where every path is the one it had when the
 * whole router was one file.
 */

const UnitSortSchema = z.object({
	columnId: z.enum(UNIT_SORT_COLUMN_IDS),
	direction: z.enum(['asc', 'desc'])
});

/**
 * A unit directory's order: the one chosen, then the directory's own, name then id.
 *
 * A status and an occupant are shared by many units of one complex, so ties fall back to the
 * name rather than to the id, as the complexes' own ties do. `tenantName` is the expression the
 * row selects, so the order and the name a card shows cannot come to differ.
 */
function unitOrderBy(
	chosenSort: z.infer<typeof UnitSortSchema> | undefined,
	tenantName: SQL<string | null>,
	viewsTenant: boolean
): SQL[] {
	const directoryOrder = [asc(s.unit.name), asc(s.unit.id)];
	// nor by an occupant that a member who may not view tenants is not shown (effort 838,
	// requirement 10).
	const sort = chosenSort?.columnId === 'tenantName' && !viewsTenant ? undefined : chosenSort;

	if (!sort) {
		return directoryOrder;
	}

	const columns: Record<UnitSortColumnId, SQL | AnyColumn> = {
		name: s.unit.name,
		tenantName,
		status: s.unit.status
	};
	const column = columns[sort.columnId];
	const chosen = sort.direction === 'asc' ? asc(column) : desc(column);

	return sort.columnId === 'name' ? [chosen, asc(s.unit.id)] : [chosen, ...directoryOrder];
}

/**
 * The name of the tenant occupying a unit today, or null where nobody is.
 *
 * The rule is `deriveUnitStatus`'s, expressed for the query rather than for a loaded row:
 * an assignment whose contract holds an occupying status and whose period covers today. Which
 * statuses occupy is the contract's to say, and it contributes them (`UnitContributions`).
 * `limit 1` is what keeps one unit to one row — assignments cannot legally overlap, so the
 * subquery is choosing between rows that should not both exist rather than picking a
 * winner.
 */
function occupyingTenantName(now: DateLike, occupying: UnitContributions['occupyingStatuses']) {
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
				inArray(s.contract.status, occupying),
				lt(s.contract.start, dayEnd),
				gte(s.contract.end, dayStart)
			)
		)
		.orderBy(desc(s.contract.start))
		.limit(1);

	return sql<string | null>`(${occupant})`;
}

/**
 * What deleting a whole selection of units would do, from one read of the workspace: the
 * complex's own (`planComplexSelection`, in its router) one level down.
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

/**
 * The units with the status the contracts holding them derive today. The derivation is the
 * contract's, which it contributes (`UnitContributions`), since the contract depends on the unit.
 */
async function getUnitsWithDerivedStatus(
	ctx: Pick<Context, 'db' | 'clock'> & Contributed,
	units: (typeof s.unit.$inferSelect)[]
) {
	const unitIds = units.map((unit) => unit.id);

	if (unitIds.length === 0) {
		return units;
	}

	const statusByUnitId = await ctx.contributions.unit.unitStatuses(ctx, unitIds);

	return units.map((unit) => ({
		...unit,
		status: statusByUnitId.get(unit.id) ?? 'vacant'
	}));
}

export default router({
	// one unit, carrying the complex holding it: a unit is reached only through its complex,
	// so a view of one that could not name it would send the reader back to find out where
	// they are. The name is left out for a member who may not view complexes (effort 838,
	// requirement 10); the id stays, since it is the unit's own column.
	get: procedure
		.permitted('viewUnit')
		.input(UnitSchema.pick({ id: true }))
		.query(async ({ input, ctx }) => {
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
			const { complexName, ...own } = unit;

			return {
				...own,
				...(permits(ctx.identity.permissions, 'viewComplex') ? { complexName } : {}),
				status: withStatus?.status ?? unit.status
			};
		}),

	/**
	 * The units a palette search reaches, by their own name or the complex holding them. A
	 * member who may not view complexes reaches a unit by its name alone, and is shown no
	 * complex beside it (effort 838, requirement 10).
	 */
	search: procedure
		.permitted('viewUnit')
		.input(RecordSearchSchema)
		.query(async ({ input, ctx }): Promise<RecordMatch[]> => {
			const viewsComplex = permits(ctx.identity.permissions, 'viewComplex');
			const units = await ctx.db
				.select({ id: s.unit.id, label: s.unit.name, hint: s.complex.name })
				.from(s.unit)
				.innerJoin(s.complex, eq(s.unit.complexId, s.complex.id))
				.where(
					matchesAnySearch(viewsComplex ? [s.unit.name, s.complex.name] : [s.unit.name], input.term)
				)
				.orderBy(asc(s.complex.name), asc(s.unit.name), asc(s.unit.id))
				.limit(input.limit);

			return units.map((unit) => (viewsComplex ? unit : { ...unit, hint: '' }));
		}),

	getMany: procedure
		.permitted('viewUnit')
		.input(
			UnitSchema.pick({ complexId: true }).extend({
				search: z.string().optional(),
				sort: UnitSortSchema.optional()
			})
		)
		.query(async ({ input, ctx }) => {
			const search = input.search?.trim();
			const tenantName = occupyingTenantName(
				ctx.clock.now(),
				ctx.contributions.unit.occupyingStatuses
			);
			// the occupant is named, and searched by, only for a member who may view tenants
			// (effort 838, requirement 10).
			const viewsTenant = permits(ctx.identity.permissions, 'viewTenant');

			// the directory's own order is the name, and the reader may choose another from the
			// keys the card shows, as every list may (effort 832, ticket 30).
			const units = await ctx.db
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
						search
							? matchesAnySearch(viewsTenant ? [s.unit.name, tenantName] : [s.unit.name], search)
							: undefined
					)
				)
				.orderBy(...unitOrderBy(input.sort, tenantName, viewsTenant));

			return units.map(({ tenantName, ...unit }) => ({
				...unit,
				...(viewsTenant ? { tenantName } : {})
			}));
		}),

	// an optional id, so undoing a deletion can put the row back with the identity it had — a
	// page still open on that record is holding a reference to it (ADR 0026). Absent
	// otherwise, and the engine assigns one.
	create: procedure
		.permitted('createUnit')
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
					.where(sql`${s.unit.name} = ${input.name} AND ${s.unit.complexId} == ${input.complexId}`)
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

	update: procedure
		.permitted('editUnit')
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

	delete: procedure
		.permitted('deleteUnit')
		.use(autosync())
		.input(UnitSchema.pick({ id: true }))
		.mutation(async ({ input, ctx }) => {
			ensureUnitDeletable(
				await ctx.db.select().from(s.contractUnit).where(eq(s.contractUnit.unitId, input.id))
			);

			const deleted = await ctx.db.delete(s.unit).where(eq(s.unit.id, input.id)).returning().get();

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
	planMany: procedure
		.permitted('viewUnit')
		.input(z.object({ ids: z.array(UnitSchema.shape.id).min(1) }))
		.query(async ({ input, ctx }) => {
			const plan = await planUnitSelection(ctx.db, input.ids);

			return { eligible: plan.eligible.map((unit) => unit.id), refused: plan.refused };
		}),

	/**
	 * Delete every unit named that no contract has ever held, and say which could not be.
	 *
	 * **One delete over the whole set, not one per record**, for the reason the complex's own
	 * gives.
	 *
	 * **No reconcile pass, and nothing writes a status here.** A unit that may be deleted at
	 * all has never been assigned, so no contract's derived state named it and no other unit's
	 * did either. Occupancy moves through reconciliation alone, and this mutation gives it
	 * nothing to move: what it removed was already outside every touch-set.
	 */
	deleteMany: procedure
		.permitted('deleteUnit')
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
	createMany: procedure
		.permitted('createUnit')
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
				throw refuse('unit.repeatedInSet', { value: repeated });
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
});
