import * as s from '$lib/api/database/schema';
import { TenantSchema } from '$lib/api/database/schema';
import { autosync, procedure, router } from '$lib/api/trpc';
import { PaginationSchema, resolvePagination, toPaginatedResult } from '$lib/api/utils/pagination';
import { TRPCError } from '@trpc/server';
import { asc, eq, like, or, sql } from 'drizzle-orm';
import z from 'zod';

export default router({
	create: procedure.public
		.use(autosync())
		.input(TenantSchema.omit({ id: true }))
		.mutation(async ({ input, ctx }) => {
			const isNationalIdUsed = await ctx.db
				.select()
				.from(s.tenant)
				.where(eq(s.tenant.nationalId, input.nationalId))
				.get();

			if (isNationalIdUsed) {
				throw new TRPCError({
					code: 'BAD_REQUEST',
					message: 'national id is associated with a registered tenant'
				});
			}

			const isPhoneUsed = await ctx.db
				.select()
				.from(s.tenant)
				.where(eq(s.tenant.phone, input.phone))
				.get();

			if (isPhoneUsed) {
				throw new TRPCError({
					code: 'BAD_REQUEST',
					message: 'phone is associated with a registered tenant'
				});
			}

			const created = await ctx.db.insert(s.tenant).values(input).returning().get();

			return created;
		}),

	update: procedure.public
		.use(autosync())
		.input(TenantSchema.partial({ name: true, nationalId: true, phone: true }))
		.mutation(async ({ input, ctx }) => {
			const isNationalIdUsed = await ctx.db
				.select()
				.from(s.tenant)
				.where(sql`${s.tenant.nationalId} = ${input.nationalId} AND ${s.tenant.id} != ${input.id}`)
				.get();

			if (isNationalIdUsed) {
				throw new TRPCError({
					code: 'BAD_REQUEST',
					message: 'national id is associated with a registered tenant'
				});
			}

			const isPhoneUsed = await ctx.db
				.select()
				.from(s.tenant)
				.where(sql`${s.tenant.phone} = ${input.phone} AND ${s.tenant.id} != ${input.id}`)
				.get();

			if (isPhoneUsed) {
				throw new TRPCError({
					code: 'BAD_REQUEST',
					message: 'phone is associated with a registered tenant'
				});
			}

			const updated = await ctx.db
				.update(s.tenant)
				.set({ name: input.name, nationalId: input.nationalId, phone: input.phone })
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

			if (contracts?.length > 0) {
				throw new TRPCError({
					code: 'BAD_REQUEST',
					message: 'cannot delete tenant with associated contracts'
				});
			}

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
				limit: z.number().int().positive().max(50).optional()
			})
		)
		.query(async ({ input, ctx }) => {
			const search = input.search?.trim();

			if (search) {
				const searchPattern = `%${search}%`;
				const query = ctx.db
					.select()
					.from(s.tenant)
					.where(
						or(
							like(s.tenant.nationalId, searchPattern),
							like(s.tenant.phone, searchPattern),
							like(s.tenant.name, searchPattern)
						)
					)
					.orderBy(asc(s.tenant.name), asc(s.tenant.id));

				return input.limit ? await query.limit(input.limit) : await query;
			}

			const query = ctx.db.select().from(s.tenant).orderBy(asc(s.tenant.name), asc(s.tenant.id));

			return input.limit ? await query.limit(input.limit) : await query;
		}),

	getPaginated: procedure.public
		.input(PaginationSchema.extend({ search: z.string().optional() }))
		.query(async ({ input, ctx }) => {
			const { limit, offset } = resolvePagination(input);
			const search = input.search?.trim();
			const query = ctx.db.select().from(s.tenant);

			const tenants = await (
				search
					? query
							.where(
								or(
									like(s.tenant.nationalId, `%${search}%`),
									like(s.tenant.phone, `%${search}%`),
									like(s.tenant.name, `%${search}%`)
								)
							)
							.orderBy(asc(s.tenant.name), asc(s.tenant.id))
					: query.orderBy(asc(s.tenant.name), asc(s.tenant.id))
			)
				.limit(limit + 1)
				.offset(offset);

			return toPaginatedResult(tenants, limit, offset);
		})
});
