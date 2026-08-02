import type { Database } from '$lib/api/context';
import * as s from '$lib/api/database/schema';
import { ContractSchema } from '$lib/api/database/schema';
import { autosync, procedure, router } from '$lib/api/trpc';
import { PaginationSchema, resolvePagination, toPaginatedResult } from '$lib/api/utils/pagination';
import {
	deriveContractStatus,
	deriveUnitStatuses,
	ensureContractDeletable,
	ensureContractIsNotTerminated,
	ensureContractTerminable,
	ensureContractUnterminable,
	ensureContractUnitsAreMutable,
	ensureGovIdAvailable,
	ensurePeriodDoesNotOverlapAssignments,
	ensureUnitsAssignable,
	ensureValidContractInput,
	getConflictingAssignedUnitIds,
	hasSameUtcDateRange
} from '$lib/contract/contract';
import { reconcile } from '$lib/contract/reconcile';
import { serializeContract, type SerializedContract } from '$lib/contract/serialize';
import dashboard from '$lib/dashboard/router';
import { groupPaymentsByContractId } from '$lib/payment/payment';
import payment from '$lib/payment/router';
import { TRPCError } from '@trpc/server';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import z from 'zod';

const ContractCreateSchema = ContractSchema.omit({ id: true, status: true });
const ContractUpdateSchema = ContractSchema.omit({ status: true });

const ContractUnitsGetManySchema = z.object({ contractId: z.number() });
const ContractVacantUnitsGetManySchema = z.object({
	contractId: z.number(),
	complexId: z.number()
});
const ContractUnitsAssignSchema = z.object({
	contractId: z.number(),
	complexId: z.number(),
	unitIds: z.array(z.number()).min(1, 'at least one unit must be selected')
});
const ContractUnitRemoveSchema = z.object({
	contractId: z.number(),
	unitId: z.number()
});

// fetches the assignment rows (joined with their contracts) for the given units — the
// shape every derivation and overlap rule takes.
async function selectAssignmentsForUnits(db: Database, unitIds: number[]) {
	if (unitIds.length === 0) {
		return [];
	}

	return await db
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
}

// fetches the payment rows registered against a contract, for rules that lock on them.
async function selectPaymentsForContract(db: Database, contractId: number) {
	return await db.select().from(s.payment).where(eq(s.payment.contractId, contractId));
}

function matchesContractSearch(contract: SerializedContract, search: string) {
	return [
		contract.govId,
		contract.tenantName,
		contract.tenantPhone,
		String(contract.tenantId),
		contract.status,
		contract.interval,
		String(contract.cost)
	]
		.filter((value): value is string => Boolean(value))
		.some((value) => value.toLowerCase().includes(search));
}

export default router({
	create: procedure.public
		.use(autosync())
		.input(ContractCreateSchema)
		.mutation(async ({ input, ctx }) => {
			const now = ctx.clock.now();

			ensureValidContractInput(input);

			const tenant = await ctx.db
				.select()
				.from(s.tenant)
				.where(eq(s.tenant.id, input.tenantId))
				.get();

			if (!tenant) {
				throw new TRPCError({
					code: 'BAD_REQUEST',
					message: 'tenant does not exist'
				});
			}

			const normalizedGovId = input.govId?.trim() || null;

			ensureGovIdAvailable(
				normalizedGovId
					? await ctx.db
							.select()
							.from(s.contract)
							.where(eq(s.contract.govId, normalizedGovId))
							.get()
					: undefined
			);

			const initialStatus = deriveContractStatus(
				{
					status: 'active',
					start: new Date(input.start),
					end: new Date(input.end),
					interval: input.interval,
					cost: input.cost
				},
				[],
				now
			);

			const created = await ctx.db
				.insert(s.contract)
				.values({
					...input,
					govId: normalizedGovId,
					status: initialStatus,
					start: new Date(input.start),
					end: new Date(input.end)
				})
				.returning()
				.get();

			await reconcile(ctx.db, now);

			return serializeContract(created, now);
		}),

	update: procedure.public
		.use(autosync())
		.input(ContractUpdateSchema)
		.mutation(async ({ input, ctx }) => {
			const now = ctx.clock.now();

			ensureValidContractInput(input);

			const existingContract = await ctx.db
				.select()
				.from(s.contract)
				.where(eq(s.contract.id, input.id))
				.get();

			if (!existingContract) {
				throw new TRPCError({
					code: 'BAD_REQUEST',
					message: 'contract does not exist'
				});
			}

			ensureContractIsNotTerminated(existingContract.status);

			const tenant = await ctx.db
				.select()
				.from(s.tenant)
				.where(eq(s.tenant.id, input.tenantId))
				.get();

			if (!tenant) {
				throw new TRPCError({
					code: 'BAD_REQUEST',
					message: 'tenant does not exist'
				});
			}

			const normalizedGovId = input.govId?.trim() || null;

			ensureGovIdAvailable(
				normalizedGovId
					? await ctx.db
							.select()
							.from(s.contract)
							.where(
								sql`${s.contract.govId} = ${normalizedGovId} AND ${s.contract.id} != ${input.id}`
							)
							.get()
					: undefined
			);

			const hasDateRangeChanged = !hasSameUtcDateRange(
				existingContract.start,
				existingContract.end,
				input.start,
				input.end
			);

			if (hasDateRangeChanged) {
				const assignedUnits = await ctx.db
					.select({ unitId: s.contractUnit.unitId })
					.from(s.contractUnit)
					.where(eq(s.contractUnit.contractId, input.id));
				const assignments = await selectAssignmentsForUnits(ctx.db, [
					...new Set(assignedUnits.map((assignment) => assignment.unitId))
				]);

				ensurePeriodDoesNotOverlapAssignments(
					assignments,
					{ start: input.start, end: input.end },
					input.id
				);
			}

			const existingPayments = await selectPaymentsForContract(ctx.db, input.id);
			const nextStatus = deriveContractStatus(
				{
					status: existingContract.status,
					start: new Date(input.start),
					end: new Date(input.end),
					interval: input.interval,
					cost: input.cost
				},
				existingPayments,
				now
			);

			const updated = await ctx.db
				.update(s.contract)
				.set({
					govId: normalizedGovId,
					status: nextStatus,
					start: new Date(input.start),
					end: new Date(input.end),
					interval: input.interval,
					cost: input.cost,
					tenantId: input.tenantId
				})
				.where(eq(s.contract.id, input.id))
				.returning()
				.get();

			await reconcile(ctx.db, now);

			return serializeContract(updated, now);
		}),

	terminate: procedure.public
		.use(autosync())
		.input(ContractSchema.pick({ id: true }))
		.mutation(async ({ input, ctx }) => {
			const now = ctx.clock.now();

			const existingContract = await ctx.db
				.select()
				.from(s.contract)
				.where(eq(s.contract.id, input.id))
				.get();

			if (!existingContract) {
				throw new TRPCError({
					code: 'BAD_REQUEST',
					message: 'contract does not exist'
				});
			}

			const payments = await selectPaymentsForContract(ctx.db, input.id);

			ensureContractTerminable(deriveContractStatus(existingContract, payments, now));

			const terminated = await ctx.db
				.update(s.contract)
				.set({ status: 'terminated' })
				.where(eq(s.contract.id, input.id))
				.returning()
				.get();

			await reconcile(ctx.db, now);

			return serializeContract(terminated, now);
		}),

	unterminate: procedure.public
		.use(autosync())
		.input(ContractSchema.pick({ id: true }))
		.mutation(async ({ input, ctx }) => {
			const now = ctx.clock.now();

			const existingContract = await ctx.db
				.select()
				.from(s.contract)
				.where(eq(s.contract.id, input.id))
				.get();

			if (!existingContract) {
				throw new TRPCError({
					code: 'BAD_REQUEST',
					message: 'contract does not exist'
				});
			}

			ensureContractUnterminable(existingContract.status);

			const payments = await selectPaymentsForContract(ctx.db, input.id);
			const restoredStatus = deriveContractStatus(
				{ ...existingContract, status: 'active' },
				payments,
				now
			);

			const restored = await ctx.db
				.update(s.contract)
				.set({ status: restoredStatus })
				.where(eq(s.contract.id, input.id))
				.returning()
				.get();

			await reconcile(ctx.db, now);

			return serializeContract(restored, now);
		}),

	delete: procedure.public
		.use(autosync())
		.input(ContractSchema.pick({ id: true }))
		.mutation(async ({ input, ctx }) => {
			const now = ctx.clock.now();

			const existingContract = await ctx.db
				.select()
				.from(s.contract)
				.where(eq(s.contract.id, input.id))
				.get();

			if (!existingContract) {
				return undefined;
			}

			const units = await ctx.db
				.select()
				.from(s.contractUnit)
				.where(eq(s.contractUnit.contractId, input.id));
			const payments = await selectPaymentsForContract(ctx.db, input.id);

			ensureContractDeletable(units, payments);

			const deleted = await ctx.db
				.delete(s.contract)
				.where(eq(s.contract.id, input.id))
				.returning()
				.get();

			return deleted ? serializeContract(deleted, now) : deleted;
		}),

	get: procedure.public
		.input(ContractSchema.pick({ id: true, govId: true }).partial())
		.query(async ({ input, ctx }) => {
			const now = ctx.clock.now();

			if (input.id) {
				const contract = await ctx.db
					.select()
					.from(s.contract)
					.where(eq(s.contract.id, input.id))
					.get();

				if (!contract) {
					return undefined;
				}

				const payments = await ctx.db
					.select()
					.from(s.payment)
					.where(eq(s.payment.contractId, contract.id));

				return serializeContract(contract, now, groupPaymentsByContractId(payments));
			}

			if (input.govId) {
				const contract = await ctx.db
					.select()
					.from(s.contract)
					.where(eq(s.contract.govId, input.govId))
					.get();

				if (!contract) {
					return undefined;
				}

				const payments = await ctx.db
					.select()
					.from(s.payment)
					.where(eq(s.payment.contractId, contract.id));

				return serializeContract(contract, now, groupPaymentsByContractId(payments));
			}

			return undefined;
		}),

	getMany: procedure.public
		.input(z.object({ search: z.string().optional() }))
		.query(async ({ input, ctx }) => {
			const now = ctx.clock.now();
			const contracts = await ctx.db
				.select({
					contract: s.contract,
					tenantName: s.tenant.name,
					tenantPhone: s.tenant.phone
				})
				.from(s.contract)
				.innerJoin(s.tenant, eq(s.contract.tenantId, s.tenant.id));
			const contractIds = contracts.map(({ contract }) => contract.id);
			const payments = contractIds.length
				? await ctx.db.select().from(s.payment).where(inArray(s.payment.contractId, contractIds))
				: [];
			const paymentsByContractId = groupPaymentsByContractId(payments);
			const serializedContracts = contracts.map(({ contract, tenantName, tenantPhone }) =>
				serializeContract(contract, now, paymentsByContractId, tenantName, tenantPhone)
			);

			if (!input.search) {
				return serializedContracts;
			}

			const search = input.search.trim().toLowerCase();

			return serializedContracts.filter((contract) => matchesContractSearch(contract, search));
		}),

	getPaginated: procedure.public
		.input(PaginationSchema.extend({ search: z.string().optional() }))
		.query(async ({ input, ctx }) => {
			const now = ctx.clock.now();
			const { limit, offset } = resolvePagination(input);
			const search = input.search?.trim().toLowerCase();

			if (search) {
				const contracts = await ctx.db
					.select({
						contract: s.contract,
						tenantName: s.tenant.name,
						tenantPhone: s.tenant.phone
					})
					.from(s.contract)
					.innerJoin(s.tenant, eq(s.contract.tenantId, s.tenant.id))
					.orderBy(asc(s.contract.id));
				const contractIds = contracts.map(({ contract }) => contract.id);
				const payments = contractIds.length
					? await ctx.db.select().from(s.payment).where(inArray(s.payment.contractId, contractIds))
					: [];
				const paymentsByContractId = groupPaymentsByContractId(payments);
				const serializedContracts = contracts.map(({ contract, tenantName, tenantPhone }) =>
					serializeContract(contract, now, paymentsByContractId, tenantName, tenantPhone)
				);

				return toPaginatedResult(
					serializedContracts.filter((contract) => matchesContractSearch(contract, search)),
					limit,
					offset
				);
			}

			const contracts = await ctx.db
				.select({
					contract: s.contract,
					tenantName: s.tenant.name,
					tenantPhone: s.tenant.phone
				})
				.from(s.contract)
				.innerJoin(s.tenant, eq(s.contract.tenantId, s.tenant.id))
				.orderBy(asc(s.contract.id))
				.limit(limit + 1)
				.offset(offset);
			const pageContracts = contracts.slice(0, limit);
			const contractIds = pageContracts.map(({ contract }) => contract.id);
			const payments = contractIds.length
				? await ctx.db.select().from(s.payment).where(inArray(s.payment.contractId, contractIds))
				: [];
			const paymentsByContractId = groupPaymentsByContractId(payments);

			return {
				items: pageContracts.map(({ contract, tenantName, tenantPhone }) =>
					serializeContract(contract, now, paymentsByContractId, tenantName, tenantPhone)
				),
				nextOffset: contracts.length > limit ? offset + limit : null
			};
		}),

	units: {
		getMany: procedure.public.input(ContractUnitsGetManySchema).query(async ({ input, ctx }) => {
			const now = ctx.clock.now();

			const units = await ctx.db
				.select({
					id: s.unit.id,
					name: s.unit.name,
					complexId: s.unit.complexId,
					complexName: s.complex.name,
					contractId: s.contractUnit.contractId
				})
				.from(s.contractUnit)
				.innerJoin(s.unit, eq(s.contractUnit.unitId, s.unit.id))
				.innerJoin(s.complex, eq(s.unit.complexId, s.complex.id))
				.where(eq(s.contractUnit.contractId, input.contractId));

			const unitIds = [...new Set(units.map((unit) => unit.id))];

			if (unitIds.length === 0) {
				return units;
			}

			const assignments = await selectAssignmentsForUnits(ctx.db, unitIds);
			const contractIds = [...new Set(assignments.map((assignment) => assignment.contractId))];
			const payments = contractIds.length
				? await ctx.db.select().from(s.payment).where(inArray(s.payment.contractId, contractIds))
				: [];
			const statusByUnitId = deriveUnitStatuses(
				unitIds,
				assignments,
				groupPaymentsByContractId(payments),
				now
			);

			return units.map((unit) => ({
				...unit,
				status: statusByUnitId.get(unit.id) ?? 'vacant'
			}));
		}),

		getVacantMany: procedure.public
			.input(ContractVacantUnitsGetManySchema)
			.query(async ({ input, ctx }) => {
				const now = ctx.clock.now();

				const contract = await ctx.db
					.select()
					.from(s.contract)
					.where(eq(s.contract.id, input.contractId))
					.get();

				if (!contract) {
					throw new TRPCError({
						code: 'BAD_REQUEST',
						message: 'contract does not exist'
					});
				}

				const units = await ctx.db
					.select({
						id: s.unit.id,
						name: s.unit.name,
						complexId: s.unit.complexId
					})
					.from(s.unit)
					.where(eq(s.unit.complexId, input.complexId));

				const unitIds = units.map((unit) => unit.id);

				if (unitIds.length === 0) {
					return units;
				}

				const assignments = await selectAssignmentsForUnits(ctx.db, unitIds);
				const contractIds = [...new Set(assignments.map((assignment) => assignment.contractId))];
				const payments = contractIds.length
					? await ctx.db.select().from(s.payment).where(inArray(s.payment.contractId, contractIds))
					: [];
				const statusByUnitId = deriveUnitStatuses(
					unitIds,
					assignments,
					groupPaymentsByContractId(payments),
					now
				);
				const conflictingUnitIds = getConflictingAssignedUnitIds(
					assignments,
					contract,
					input.contractId
				);
				const currentContractUnitIds = new Set(
					assignments
						.filter((assignment) => assignment.contractId === input.contractId)
						.map((assignment) => assignment.unitId)
				);

				return units
					.filter(
						(unit) => !conflictingUnitIds.has(unit.id) && !currentContractUnitIds.has(unit.id)
					)
					.map((unit) => ({
						...unit,
						status: statusByUnitId.get(unit.id) ?? 'vacant'
					}));
			}),

		assign: procedure.public
			.use(autosync())
			.input(ContractUnitsAssignSchema)
			.mutation(async ({ input, ctx }) => {
				const now = ctx.clock.now();

				const contract = await ctx.db
					.select()
					.from(s.contract)
					.where(eq(s.contract.id, input.contractId))
					.get();

				if (!contract) {
					throw new TRPCError({
						code: 'BAD_REQUEST',
						message: 'contract does not exist'
					});
				}

				ensureContractIsNotTerminated(contract.status);
				ensureContractUnitsAreMutable(await selectPaymentsForContract(ctx.db, input.contractId));

				const complex = await ctx.db
					.select()
					.from(s.complex)
					.where(eq(s.complex.id, input.complexId))
					.get();

				if (!complex) {
					throw new TRPCError({
						code: 'BAD_REQUEST',
						message: 'complex does not exist'
					});
				}

				const unitIds = [...new Set(input.unitIds)];
				const units = await ctx.db
					.select()
					.from(s.unit)
					.where(and(eq(s.unit.complexId, input.complexId), inArray(s.unit.id, unitIds)));

				if (units.length !== unitIds.length) {
					throw new TRPCError({
						code: 'BAD_REQUEST',
						message: 'one or more units could not be found in the selected complex'
					});
				}

				const existingAssignments = await selectAssignmentsForUnits(ctx.db, unitIds);

				ensureUnitsAssignable(existingAssignments, contract, input.contractId);

				for (const unitId of unitIds) {
					await ctx.db.insert(s.contractUnit).values({ contractId: input.contractId, unitId });
				}

				const assignedUnits = await ctx.db
					.select({
						id: s.unit.id,
						name: s.unit.name,
						complexId: s.unit.complexId,
						complexName: s.complex.name,
						contractId: s.contractUnit.contractId
					})
					.from(s.contractUnit)
					.innerJoin(s.unit, eq(s.contractUnit.unitId, s.unit.id))
					.innerJoin(s.complex, eq(s.unit.complexId, s.complex.id))
					.where(
						and(
							eq(s.contractUnit.contractId, input.contractId),
							inArray(s.contractUnit.unitId, unitIds)
						)
					);

				const assignments = await selectAssignmentsForUnits(ctx.db, unitIds);
				const contractIds = [...new Set(assignments.map((assignment) => assignment.contractId))];
				const assignmentPayments = contractIds.length
					? await ctx.db.select().from(s.payment).where(inArray(s.payment.contractId, contractIds))
					: [];
				const assignedStatusByUnitId = deriveUnitStatuses(
					unitIds,
					assignments,
					groupPaymentsByContractId(assignmentPayments),
					now
				);

				await reconcile(ctx.db, now);

				return assignedUnits.map((unit) => ({
					...unit,
					status: assignedStatusByUnitId.get(unit.id) ?? 'vacant'
				}));
			}),

		remove: procedure.public
			.use(autosync())
			.input(ContractUnitRemoveSchema)
			.mutation(async ({ input, ctx }) => {
				const now = ctx.clock.now();

				const contract = await ctx.db
					.select()
					.from(s.contract)
					.where(eq(s.contract.id, input.contractId))
					.get();

				if (!contract) {
					throw new TRPCError({
						code: 'BAD_REQUEST',
						message: 'contract does not exist'
					});
				}

				ensureContractIsNotTerminated(contract.status);
				ensureContractUnitsAreMutable(await selectPaymentsForContract(ctx.db, input.contractId));

				const existingAssignment = await ctx.db
					.select()
					.from(s.contractUnit)
					.where(
						and(
							eq(s.contractUnit.contractId, input.contractId),
							eq(s.contractUnit.unitId, input.unitId)
						)
					)
					.get();

				if (!existingAssignment) {
					throw new TRPCError({
						code: 'BAD_REQUEST',
						message: 'unit is not assigned to this contract'
					});
				}

				const unit = await ctx.db.select().from(s.unit).where(eq(s.unit.id, input.unitId)).get();

				await ctx.db
					.delete(s.contractUnit)
					.where(
						and(
							eq(s.contractUnit.contractId, input.contractId),
							eq(s.contractUnit.unitId, input.unitId)
						)
					);

				await reconcile(ctx.db, now);

				return {
					contractId: input.contractId,
					unitId: input.unitId,
					complexId: unit?.complexId
				};
			})
	},

	payments: payment,

	dashboard
});
