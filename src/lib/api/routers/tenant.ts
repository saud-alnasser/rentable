import * as s from '$lib/api/database/schema';
import { TenantSchema } from '$lib/api/database/schema';
import { procedure, router } from '$lib/api/trpc';
import { TRPCError } from '@trpc/server';
import { eq, inArray, sql } from 'drizzle-orm';
import z from 'zod';

export default router({
	create: procedure.public
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

			return await ctx.db.insert(s.tenant).values(input).returning().get();
		}),

	update: procedure.public
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

			return await ctx.db
				.update(s.tenant)
				.set({ name: input.name, nationalId: input.nationalId, phone: input.phone })
				.where(eq(s.tenant.id, input.id))
				.returning()
				.get();
		}),

	delete: procedure.public
		.input(TenantSchema.pick({ id: true }))
		.mutation(async ({ input, ctx }) => {
			return await ctx.db.delete(s.tenant).where(eq(s.tenant.id, input.id)).returning().get();
		}),

	deleteMany: procedure.public
		.input(z.object({ ids: z.array(TenantSchema.shape.id) }))
		.mutation(async ({ input, ctx }) => {
			return await ctx.db.delete(s.tenant).where(inArray(s.tenant.id, input.ids)).returning().all();
		}),

	get: procedure.public.input(TenantSchema.partial()).query(async ({ input, ctx }) => {
		if (input.id) {
			return await ctx.db.select().from(s.tenant).where(eq(s.tenant.id, input.id)).get();
		}

		if (input.name) {
			return await ctx.db
				.select()
				.from(s.tenant)
				.where(sql`${s.tenant.name} LIKE %${input.name}%`)
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
		.input(z.object({ search: z.string().optional() }))
		.query(async ({ input, ctx }) => {
			if (input.search) {
				return await ctx.db
					.select()
					.from(s.tenant)
					.where(
						sql`${s.tenant.nationalId} LIKE %${input.search}% OR ${s.tenant.phone} LIKE %${input.search}% OR ${s.tenant.name} LIKE %${input.search}%`
					);
			}

			return await ctx.db.select().from(s.tenant);
		})
});
