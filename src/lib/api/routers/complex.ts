import * as s from '$lib/api/database/schema';
import { ComplexSchema, UnitSchema } from '$lib/api/database/schema';
import { procedure, router } from '$lib/api/trpc';
import { deriveUnitStatus } from '$lib/api/utils/contract-status';
import { PaginationSchema, resolvePagination, toPaginatedResult } from '$lib/api/utils/pagination';
import { TRPCError } from '@trpc/server';
import { asc, eq, inArray, like, or, sql } from 'drizzle-orm';
import z from 'zod';

type DbPayment = typeof s.payment.$inferSelect;

type ContractAssignmentRow = {
	unitId: number;
	contractId: number;
	status: (typeof s.contract.$inferSelect)['status'];
	start: (typeof s.contract.$inferSelect)['start'];
	end: (typeof s.contract.$inferSelect)['end'];
	interval: (typeof s.contract.$inferSelect)['interval'];
	cost: (typeof s.contract.$inferSelect)['cost'];
};

function groupPaymentsByContractId(payments: DbPayment[]) {
	const paymentsByContractId = new Map<number, DbPayment[]>();

	for (const payment of payments) {
		paymentsByContractId.set(payment.contractId, [
			...(paymentsByContractId.get(payment.contractId) ?? []),
			payment
		]);
	}

	return paymentsByContractId;
}

function getDerivedUnitStatuses(
	unitIds: number[],
	assignments: ContractAssignmentRow[],
	paymentsByContractId: Map<number, DbPayment[]>
) {
	const assignmentsByUnitId = new Map<
		number,
		Array<{
			contract: Pick<ContractAssignmentRow, 'status' | 'start' | 'end' | 'interval' | 'cost'>;
			payments: DbPayment[];
		}>
	>();

	for (const assignment of assignments) {
		assignmentsByUnitId.set(assignment.unitId, [
			...(assignmentsByUnitId.get(assignment.unitId) ?? []),
			{
				contract: {
					status: assignment.status,
					start: assignment.start,
					end: assignment.end,
					interval: assignment.interval,
					cost: assignment.cost
				},
				payments: paymentsByContractId.get(assignment.contractId) ?? []
			}
		]);
	}

	return new Map(
		unitIds.map((unitId) => [unitId, deriveUnitStatus(assignmentsByUnitId.get(unitId) ?? [])])
	);
}

async function getUnitsWithDerivedStatus(
	ctx: { db: typeof import('$lib/api/database/mod').db },
	units: (typeof s.unit.$inferSelect)[]
) {
	const unitIds = units.map((unit) => unit.id);

	if (unitIds.length === 0) {
		return units;
	}

	const assignments: ContractAssignmentRow[] = await ctx.db
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
	const statusByUnitId = getDerivedUnitStatuses(
		unitIds,
		assignments,
		groupPaymentsByContractId(payments)
	);

	return units.map((unit) => ({
		...unit,
		status: statusByUnitId.get(unit.id) ?? 'vacant'
	}));
}

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

			const created = await ctx.db.insert(s.complex).values(input).returning().get();

			return created;
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

			const updated = await ctx.db
				.update(s.complex)
				.set({ name: input.name, location: input.location })
				.where(eq(s.complex.id, input.id))
				.returning()
				.get();

			return updated;
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
		.input(z.object({ search: z.string().optional() }))
		.query(async ({ input, ctx }) => {
			if (input.search) {
				const searchPattern = `%${input.search}%`;
				return await ctx.db
					.select()
					.from(s.complex)
					.where(or(like(s.complex.name, searchPattern), like(s.complex.location, searchPattern)));
			}

			return await ctx.db.select().from(s.complex);
		}),

	getPaginated: procedure.public
		.input(PaginationSchema.extend({ search: z.string().optional() }))
		.query(async ({ input, ctx }) => {
			const { limit, offset } = resolvePagination(input);
			const search = input.search?.trim();
			const query = ctx.db.select().from(s.complex);
			const complexes = await (
				search
					? query
							.where(
								or(like(s.complex.name, `%${search}%`), like(s.complex.location, `%${search}%`))
							)
							.orderBy(asc(s.complex.id))
					: query.orderBy(asc(s.complex.id))
			)
				.limit(limit + 1)
				.offset(offset);

			return toPaginatedResult(complexes, limit, offset);
		}),

	units: {
		get: procedure.public.input(UnitSchema.pick({ id: true })).query(async ({ input, ctx }) => {
			const units = await ctx.db.select().from(s.unit).where(eq(s.unit.id, input.id));

			return await getUnitsWithDerivedStatus(ctx, units);
		}),

		getMany: procedure.public
			.input(UnitSchema.pick({ complexId: true }))
			.query(async ({ input, ctx }) => {
				const units = await ctx.db
					.select()
					.from(s.unit)
					.where(eq(s.unit.complexId, input.complexId));

				return await getUnitsWithDerivedStatus(ctx, units);
			}),

		getPaginated: procedure.public
			.input(PaginationSchema.extend({ complexId: z.number(), search: z.string().optional() }))
			.query(async ({ input, ctx }) => {
				const { limit, offset } = resolvePagination(input);
				const search = input.search?.trim().toLowerCase();

				if (search) {
					const units = await ctx.db
						.select()
						.from(s.unit)
						.where(eq(s.unit.complexId, input.complexId))
						.orderBy(asc(s.unit.id));
					const unitsWithStatus = await getUnitsWithDerivedStatus(ctx, units);
					const filteredUnits = unitsWithStatus.filter((unit) =>
						`${unit.name} ${unit.status}`.toLowerCase().includes(search)
					);

					return toPaginatedResult(filteredUnits, limit, offset);
				}

				const units = await ctx.db
					.select()
					.from(s.unit)
					.where(eq(s.unit.complexId, input.complexId))
					.orderBy(asc(s.unit.id))
					.limit(limit + 1)
					.offset(offset);
				const pageUnits = units.slice(0, limit);

				return {
					items: await getUnitsWithDerivedStatus(ctx, pageUnits),
					nextOffset: units.length > limit ? offset + limit : null
				};
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
			.input(UnitSchema.partial({ name: true, status: true }))
			.mutation(async ({ input, ctx }) => {
				const isNameUsed = input.name
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

				const updated = await ctx.db
					.update(s.unit)
					.set({
						...(input.name !== undefined ? { name: input.name } : {}),
						...(input.status !== undefined ? { status: input.status } : {})
					})
					.where(eq(s.unit.id, input.id))
					.returning()
					.get();

				return updated;
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

				const deleted = await ctx.db
					.delete(s.unit)
					.where(eq(s.unit.id, input.id))
					.returning()
					.get();

				return deleted;
			})
	}
});
