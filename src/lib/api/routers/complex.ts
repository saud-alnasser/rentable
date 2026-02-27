import * as s from '$lib/api/database/schema';
import { ComplexSchema, UnitSchema } from '$lib/api/database/schema';
import { procedure, router } from '$lib/api/trpc';
import { TRPCError } from '@trpc/server';
import { eq, sql } from 'drizzle-orm';
import z from 'zod';

export default router({
	create: procedure.public
		.input(ComplexSchema.omit({ id: true }))
		.mutation(async ({ input, ctx }) => {
			const isNameUsed = await ctx.db
				.select()
				.from(s.complex)
				.where(eq(s.complex.name, input.name))
				.get();

			if (isNameUsed) {
				throw new TRPCError({
					code: 'BAD_REQUEST',
					message: 'name is associated with a previously registered complex'
				});
			}

			return await ctx.db.insert(s.complex).values(input).returning().get();
		}),

	update: procedure.public
		.input(ComplexSchema.partial({ name: true, location: true }))
		.mutation(async ({ input, ctx }) => {
			const isNameUsed = await ctx.db
				.select()
				.from(s.complex)
				.where(sql`${s.complex.name} = ${input.name} AND ${s.complex.id} != ${input.id}`)
				.get();

			if (isNameUsed) {
				throw new TRPCError({
					code: 'BAD_REQUEST',
					message: 'name is associated with a previously registered complex'
				});
			}

			return await ctx.db
				.update(s.complex)
				.set({ name: input.name, location: input.location })
				.where(eq(s.complex.id, input.id))
				.returning()
				.get();
		}),

	delete: procedure.public
		.input(ComplexSchema.pick({ id: true }))
		.mutation(async ({ input, ctx }) => {
			const units = await ctx.db.select().from(s.unit).where(eq(s.unit.complexId, input.id));

			if (units?.length > 0) {
				throw new TRPCError({
					code: 'BAD_REQUEST',
					message: 'cannot delete complex with associated units'
				});
			}

			return await ctx.db.delete(s.complex).where(eq(s.complex.id, input.id)).returning().get();
		}),

	get: procedure.public.input(ComplexSchema.pick({ id: true })).query(async ({ input, ctx }) => {
		return await ctx.db.select().from(s.complex).where(eq(s.complex.id, input.id)).get();
	}),

	getMany: procedure.public
		.input(z.object({ search: z.string().optional() }))
		.query(async ({ input, ctx }) => {
			if (input.search) {
				return await ctx.db
					.select()
					.from(s.complex)
					.where(
						sql`${s.complex.name} LIKE %${input.search}% OR ${s.complex.location} LIKE %${input.search}%`
					);
			}

			return await ctx.db.select().from(s.complex);
		}),

	units: {
		get: procedure.public.input(UnitSchema.pick({ id: true })).query(async ({ input, ctx }) => {
			return await ctx.db.select().from(s.unit).where(eq(s.unit.id, input.id));
		}),

		getMany: procedure.public
			.input(UnitSchema.pick({ complexId: true }))
			.query(async ({ input, ctx }) => {
				return await ctx.db.select().from(s.unit).where(eq(s.unit.complexId, input.complexId));
			}),

		create: procedure.public
			.input(UnitSchema.omit({ id: true, status: true }))
			.mutation(async ({ input, ctx }) => {
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

				return await ctx.db
					.insert(s.unit)
					.values({
						...input,
						status: 'vacant'
					})
					.returning()
					.get();
			}),

		update: procedure.public
			.input(UnitSchema.partial({ name: true, status: true }))
			.mutation(async ({ input, ctx }) => {
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

				return await ctx.db
					.update(s.unit)
					.set({ name: input.name })
					.where(eq(s.unit.id, input.id))
					.returning()
					.get();
			}),

		delete: procedure.public
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

				return await ctx.db.delete(s.unit).where(eq(s.unit.id, input.id)).returning().get();
			})
	}
});
