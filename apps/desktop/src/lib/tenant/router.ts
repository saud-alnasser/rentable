import * as s from '$lib/platform/database/schema';
import { RecordSearchSchema, type RecordMatch } from '$lib/api/search';
import { matchesAnySearch } from '$lib/platform/database/search';
import { ensureIdFree, newId } from '$lib/platform/database/identity';
import { TenantSchema, type Contract } from '$lib/platform/database/schema';
import { autosync, procedure, router } from '$lib/api/trpc';
import { CONTRACT_IN_FORCE_STATUSES } from '$lib/contract/contract';
import {
	TENANT_SORT_COLUMN_IDS,
	ensureIdentityAvailable,
	ensurePhoneAvailable,
	ensureTenantDeletable,
	type TenantSortColumnId
} from '$lib/tenant/tenant';
import { asc, desc, eq, inArray, like, sql, type AnyColumn, type SQL } from 'drizzle-orm';
import z from 'zod';

/**
 * How many of the tenant's contracts sit in one status, counted on the list query itself
 * rather than by a query per row.
 *
 * The join is no longer filtered, because the row asks about every status rather than about
 * one of them — so the filtering moves into the aggregates, one conditional count each. A
 * status nobody holds counts NULL for every row and `count` ignores it, which is how a tenant
 * with no contracts still arrives with a row and six zeroes.
 */
const contractsInStatus = (status: Contract['status']) =>
	sql<number>`count(case when ${s.contract.status} = ${status} then 1 end)`;

// what the reader means by "the tenant's contracts" when they order the directory by them:
// the ones in force, which is a pair of statuses rather than one, so it cannot be read off a
// single conditional count above.
//
// One expression, selected nowhere and ordered by directly: written twice, the column the
// list sorts on could come to differ from what it claims to sort by.
const inForceContracts = sql<number>`count(case when ${inArray(s.contract.status, CONTRACT_IN_FORCE_STATUSES)} then 1 end)`;

/**
 * The figure per status a directory row carries, as the list query selects them.
 *
 * Written out rather than folded up from the status list, because drizzle infers the shape of
 * a row from the shape of this object — and the `satisfies` is what makes a status added to
 * the enum a type error here rather than a figure silently missing from the row.
 */
const contractCountColumns = {
	contractsScheduled: contractsInStatus('scheduled').as('contractsScheduled'),
	contractsActive: contractsInStatus('active').as('contractsActive'),
	contractsFulfilled: contractsInStatus('fulfilled').as('contractsFulfilled'),
	contractsDefaulted: contractsInStatus('defaulted').as('contractsDefaulted'),
	contractsExpired: contractsInStatus('expired').as('contractsExpired'),
	contractsTerminated: contractsInStatus('terminated').as('contractsTerminated')
} satisfies Record<`contracts${Capitalize<Contract['status']>}`, unknown>;

// every field a tenant can be found by, whether or not the row shows it — a field dropped
// from a surface is never dropped from search. One list, so the directory and the palette
// answer the same term with the same rows.
const TENANT_SEARCH_COLUMNS: readonly (SQL | AnyColumn)[] = [
	s.tenant.name,
	s.tenant.nationalId,
	s.tenant.phone
];

const TENANT_SORT_COLUMNS: Record<TenantSortColumnId, SQL | AnyColumn> = {
	name: s.tenant.name,
	nationalId: s.tenant.nationalId,
	activeContractCount: inForceContracts
};

const TenantSortSchema = z.object({
	columnId: z.enum(TENANT_SORT_COLUMN_IDS),
	direction: z.enum(['asc', 'desc'])
});

/**
 * Ties fall back to the directory's own order — name, then id.
 *
 * A count is shared by hundreds of tenants, so ordering by it alone leaves most of the
 * screen tied; breaking those by id would show a page of equal counts in insertion order,
 * which reads as no order at all. The id is still last because a name is not unique, and
 * without a total order two renders of the same query may disagree.
 */
function tenantOrderBy(sort: z.infer<typeof TenantSortSchema> | undefined): SQL[] {
	const directoryOrder = [asc(s.tenant.name), asc(s.tenant.id)];

	if (!sort) {
		return directoryOrder;
	}

	const column = TENANT_SORT_COLUMNS[sort.columnId];
	const chosen = sort.direction === 'asc' ? asc(column) : desc(column);

	return sort.columnId === 'name' ? [chosen, asc(s.tenant.id)] : [chosen, ...directoryOrder];
}

export default router({
	// an optional id, so undoing a deletion can put the row back with the identity it had — a
	// page still open on that record is holding a reference to it (ADR 0026). Absent otherwise,
	// and the engine assigns one.
	create: procedure.public
		.use(autosync())
		.input(TenantSchema.partial({ id: true }))
		.mutation(async ({ input, ctx }) => {
			ensureIdFree(
				input.id === undefined
					? undefined
					: await ctx.db.select().from(s.tenant).where(eq(s.tenant.id, input.id)).get()
			);
			ensureIdentityAvailable(
				await ctx.db.select().from(s.tenant).where(eq(s.tenant.nationalId, input.nationalId)).get()
			);
			ensurePhoneAvailable(
				await ctx.db.select().from(s.tenant).where(eq(s.tenant.phone, input.phone)).get()
			);

			const created = await ctx.db
				.insert(s.tenant)
				.values({ ...input, id: input.id ?? newId() })
				.returning()
				.get();

			return created;
		}),

	update: procedure.public
		.use(autosync())
		.input(TenantSchema.partial({ name: true, nationalId: true, phone: true }))
		.mutation(async ({ input, ctx }) => {
			ensureIdentityAvailable(
				input.nationalId !== undefined
					? await ctx.db
							.select()
							.from(s.tenant)
							.where(
								sql`${s.tenant.nationalId} = ${input.nationalId} AND ${s.tenant.id} != ${input.id}`
							)
							.get()
					: null
			);
			ensurePhoneAvailable(
				input.phone !== undefined
					? await ctx.db
							.select()
							.from(s.tenant)
							.where(sql`${s.tenant.phone} = ${input.phone} AND ${s.tenant.id} != ${input.id}`)
							.get()
					: null
			);

			const values = {
				...(input.name !== undefined ? { name: input.name } : {}),
				...(input.nationalId !== undefined ? { nationalId: input.nationalId } : {}),
				...(input.phone !== undefined ? { phone: input.phone } : {})
			};

			// Drizzle refuses an empty set clause. An update naming no field means "change
			// nothing" rather than a bad request, so it reads back instead of writing.
			if (Object.keys(values).length === 0) {
				return await ctx.db.select().from(s.tenant).where(eq(s.tenant.id, input.id)).get();
			}

			const updated = await ctx.db
				.update(s.tenant)
				.set(values)
				.where(eq(s.tenant.id, input.id))
				.returning()
				.get();

			return updated;
		}),

	delete: procedure.public
		.use(autosync())
		.input(TenantSchema.pick({ id: true }))
		.mutation(async ({ input, ctx }) => {
			const contracts = await ctx.db
				.select()
				.from(s.contract)
				.where(eq(s.contract.tenantId, input.id));

			ensureTenantDeletable(contracts);

			const deleted = await ctx.db
				.delete(s.tenant)
				.where(eq(s.tenant.id, input.id))
				.returning()
				.get();

			return deleted;
		}),

	get: procedure.public.input(TenantSchema.partial()).query(async ({ input, ctx }) => {
		if (input.id) {
			return await ctx.db.select().from(s.tenant).where(eq(s.tenant.id, input.id)).get();
		}

		if (input.name) {
			return await ctx.db
				.select()
				.from(s.tenant)
				.where(like(s.tenant.name, `%${input.name}%`))
				.get();
		}

		if (input.nationalId) {
			return await ctx.db
				.select()
				.from(s.tenant)
				.where(eq(s.tenant.nationalId, input.nationalId))
				.get();
		}

		if (input.phone) {
			return await ctx.db.select().from(s.tenant).where(eq(s.tenant.phone, input.phone)).get();
		}

		return undefined;
	}),

	/** The tenants a palette search reaches, by name, identity or phone. */
	search: procedure.public
		.input(RecordSearchSchema)
		.query(async ({ input, ctx }): Promise<RecordMatch[]> => {
			const rows = await ctx.db
				.select({ id: s.tenant.id, label: s.tenant.name, hint: s.tenant.nationalId })
				.from(s.tenant)
				.where(matchesAnySearch(TENANT_SEARCH_COLUMNS, input.term))
				.orderBy(asc(s.tenant.name), asc(s.tenant.id))
				.limit(input.limit);

			return rows;
		}),

	getMany: procedure.public
		.input(
			z.object({
				search: z.string().optional(),
				sort: TenantSortSchema.optional(),
				limit: z.number().int().positive().max(50).optional()
			})
		)
		.query(async ({ input, ctx }) => {
			const search = input.search?.trim();

			const query = ctx.db
				.select({
					id: s.tenant.id,
					name: s.tenant.name,
					nationalId: s.tenant.nationalId,
					phone: s.tenant.phone,
					...contractCountColumns
				})
				.from(s.tenant)
				.leftJoin(s.contract, eq(s.contract.tenantId, s.tenant.id))
				.where(search ? matchesAnySearch(TENANT_SEARCH_COLUMNS, search) : undefined)
				.groupBy(s.tenant.id)
				.orderBy(...tenantOrderBy(input.sort));

			return input.limit ? await query.limit(input.limit) : await query;
		})
});
