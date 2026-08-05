import * as s from '$lib/platform/database/schema';
import { TenantSchema } from '$lib/platform/database/schema';
import { autosync, procedure, router } from '$lib/api/trpc';
import { CONTRACT_IN_FORCE_STATUSES } from '$lib/contract/contract';
import {
	TENANT_SORT_COLUMN_IDS,
	ensureIdentityAvailable,
	ensurePhoneAvailable,
	ensureTenantDeletable,
	type TenantSortColumnId
} from '$lib/tenant/tenant';
import { and, asc, desc, eq, inArray, like, or, sql, type AnyColumn, type SQL } from 'drizzle-orm';
import z from 'zod';

// How many contracts the tenant currently holds, counted on the list query itself rather
// than by a query per row. The join is filtered before it is counted, so a tenant with no
// contract in force still arrives with a row and a count of zero.
//
// One expression, selected under an alias and ordered by directly: written twice, the
// column the list sorts on could come to differ from the number its rows show.
const inForceContracts = sql<number>`count(${s.contract.id})`;

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
	create: procedure.public
		.use(autosync())
		.input(TenantSchema.omit({ id: true }))
		.mutation(async ({ input, ctx }) => {
			ensureIdentityAvailable(
				await ctx.db.select().from(s.tenant).where(eq(s.tenant.nationalId, input.nationalId)).get()
			);
			ensurePhoneAvailable(
				await ctx.db.select().from(s.tenant).where(eq(s.tenant.phone, input.phone)).get()
			);

			const created = await ctx.db.insert(s.tenant).values(input).returning().get();

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
			const searchPattern = search ? `%${search}%` : undefined;

			const query = ctx.db
				.select({
					id: s.tenant.id,
					name: s.tenant.name,
					nationalId: s.tenant.nationalId,
					phone: s.tenant.phone,
					activeContractCount: inForceContracts.as('activeContractCount')
				})
				.from(s.tenant)
				.leftJoin(
					s.contract,
					and(
						eq(s.contract.tenantId, s.tenant.id),
						inArray(s.contract.status, CONTRACT_IN_FORCE_STATUSES)
					)
				)
				.where(
					searchPattern
						? or(
								like(s.tenant.nationalId, searchPattern),
								like(s.tenant.phone, searchPattern),
								like(s.tenant.name, searchPattern)
							)
						: undefined
				)
				.groupBy(s.tenant.id)
				.orderBy(...tenantOrderBy(input.sort));

			return input.limit ? await query.limit(input.limit) : await query;
		})
});
