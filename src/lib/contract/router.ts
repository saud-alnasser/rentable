import type { Database } from '$lib/api/context';
import * as s from '$lib/platform/database/schema';
import { ContractSchema } from '$lib/platform/database/schema';
import { autosync, procedure, router } from '$lib/api/trpc';
import {
	CONTRACT_ATTENTION_ORDER,
	CONTRACT_SORT_COLUMN_IDS,
	type ContractSortColumnId,
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
	getContractPaymentSummary,
	hasSameUtcDateRange
} from '$lib/contract/contract';
import { reconcileTouched } from '$lib/contract/reconcile';
import { serializeContract } from '$lib/contract/serialize';
import dashboard from '$lib/dashboard/router';
import { groupPaymentsByContractId } from '$lib/payment/payment';
import payment from '$lib/payment/router';
import { TRPCError } from '@trpc/server';
import { and, asc, desc, eq, inArray, sql, type AnyColumn, type SQL } from 'drizzle-orm';
import z from 'zod';

// status and the payment aggregates are derived columns: reconcile owns them, so no
// caller may supply them.
const ContractCreateSchema = ContractSchema.omit({
	id: true,
	status: true,
	paidAmount: true,
	expectedAmount: true
});
const ContractUpdateSchema = ContractSchema.omit({
	status: true,
	paidAmount: true,
	expectedAmount: true
});

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

// ordering by status, as one expression the database can sort on: the rank a status holds in
// CONTRACT_ATTENTION_ORDER. Built from the array rather than written out, so the order is
// stated once and a status added to the enum without a rank sorts last instead of silently
// landing among the ones that need attention.
const contractAttentionRank = sql.join(
	[
		sql`case`,
		...CONTRACT_ATTENTION_ORDER.map(
			(status, rank) => sql`when ${s.contract.status} = ${status} then ${rank}`
		),
		sql`else ${CONTRACT_ATTENTION_ORDER.length} end`
	],
	sql` `
);

// How many payments have been recorded against the contract, counted on the list query itself
// rather than by a query per row — the shape the tenant and complex aggregates already take.
// A correlated subquery rather than a join, because the directory's own joins are what its
// ordering is built on and grouping them would change which rows the order sees.
//
// It is a count and never a sum: the money a contract has taken is `paid_amount`, which
// reconcile owns (ADR 0006), and a second figure derived here could disagree with it.
const contractPaymentCount = sql<number>`(
	select count(*) from ${s.payment} where ${s.payment.contractId} = ${s.contract.id}
)`;

const CONTRACT_SORT_COLUMNS: Record<ContractSortColumnId, SQL | AnyColumn> = {
	tenantName: s.tenant.name,
	govId: s.contract.govId,
	start: s.contract.start,
	end: s.contract.end,
	cost: s.contract.cost,
	status: contractAttentionRank
};

const ContractSortSchema = z.object({
	columnId: z.enum(CONTRACT_SORT_COLUMN_IDS),
	direction: z.enum(['asc', 'desc'])
});

// the order the directory opens in, and the order ties fall back to under any other: tenant
// name, then when the contract runs, then the id that makes the order total. Each term
// carries the sort key it answers, so the chosen key can be dropped from the fallback
// wherever it appears — a term repeated below the key it was chosen as can never break a tie
// that key did not already break.
const CONTRACT_DIRECTORY_ORDER: readonly { columnId?: ContractSortColumnId; term: SQL }[] = [
	{ columnId: 'tenantName', term: asc(s.tenant.name) },
	{ columnId: 'start', term: asc(s.contract.start) },
	{ term: asc(s.contract.id) }
];

/**
 * Ties fall back to the directory's own order — tenant name, then when the contract runs,
 * then id — less whichever of those the reader is already ordering by.
 *
 * A status or a cost is shared by whole screens of contracts, so ordering by one alone
 * leaves most of the list tied; breaking those by id would show equal values in insertion
 * order, which reads as no order at all. One tenant's contracts then read oldest first, and
 * the id is last because nothing above it is unique — without a total order two renders of
 * the same query may disagree.
 */
function contractOrderBy(sort: z.infer<typeof ContractSortSchema> | undefined): SQL[] {
	if (!sort) {
		return CONTRACT_DIRECTORY_ORDER.map(({ term }) => term);
	}

	const column = CONTRACT_SORT_COLUMNS[sort.columnId];
	const chosen = sort.direction === 'asc' ? asc(column) : desc(column);

	return [
		chosen,
		...CONTRACT_DIRECTORY_ORDER.filter(({ columnId }) => columnId !== sort.columnId).map(
			({ term }) => term
		)
	];
}

// every field the list can be searched by, whether or not the row shows it — a field dropped
// from a surface is never dropped from search.
//
// `%` and `_` are LIKE's own wildcards, so a term carrying either is escaped before it
// becomes a pattern: a user searching for "50%" is looking for that text, not asking to
// match everything.
function contractSearchCondition(search: string) {
	const pattern = `%${search.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
	const like = (column: SQL | AnyColumn) =>
		sql`lower(cast(${column} as text)) like lower(${pattern}) escape '\\'`;

	return sql.join(
		[
			like(s.contract.govId),
			like(s.tenant.name),
			like(s.tenant.phone),
			like(s.contract.tenantId),
			like(s.contract.status),
			like(s.contract.interval),
			like(s.contract.cost)
		],
		sql` or `
	);
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

			const contractShape = {
				status: 'active' as const,
				start: new Date(input.start),
				end: new Date(input.end),
				interval: input.interval,
				cost: input.cost
			};
			const initialStatus = deriveContractStatus(contractShape, [], now);
			const { paidAmount, expectedAmount } = getContractPaymentSummary(contractShape, []);

			const created = await ctx.db
				.insert(s.contract)
				.values({
					...input,
					govId: normalizedGovId,
					status: initialStatus,
					paidAmount,
					expectedAmount,
					start: new Date(input.start),
					end: new Date(input.end)
				})
				.returning()
				.get();

			await reconcileTouched(ctx.db, now, { contractIds: [created.id] });

			return serializeContract(created);
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
			const contractShape = {
				status: existingContract.status,
				start: new Date(input.start),
				end: new Date(input.end),
				interval: input.interval,
				cost: input.cost
			};
			const nextStatus = deriveContractStatus(contractShape, existingPayments, now);
			const { paidAmount, expectedAmount } = getContractPaymentSummary(
				contractShape,
				existingPayments
			);

			const updated = await ctx.db
				.update(s.contract)
				.set({
					govId: normalizedGovId,
					status: nextStatus,
					paidAmount,
					expectedAmount,
					start: new Date(input.start),
					end: new Date(input.end),
					interval: input.interval,
					cost: input.cost,
					tenantId: input.tenantId
				})
				.where(eq(s.contract.id, input.id))
				.returning()
				.get();

			await reconcileTouched(ctx.db, now, { contractIds: [input.id] });

			return serializeContract(updated);
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

			await reconcileTouched(ctx.db, now, { contractIds: [input.id] });

			return serializeContract(terminated);
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

			await reconcileTouched(ctx.db, now, { contractIds: [input.id] });

			return serializeContract(restored);
		}),

	delete: procedure.public
		.use(autosync())
		.input(ContractSchema.pick({ id: true }))
		.mutation(async ({ input, ctx }) => {
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

			return deleted ? serializeContract(deleted) : deleted;
		}),

	get: procedure.public
		.input(ContractSchema.pick({ id: true, govId: true }).partial())
		.query(async ({ input, ctx }) => {
			if (input.id) {
				const contract = await ctx.db
					.select()
					.from(s.contract)
					.where(eq(s.contract.id, input.id))
					.get();

				return contract ? serializeContract(contract) : undefined;
			}

			if (input.govId) {
				const contract = await ctx.db
					.select()
					.from(s.contract)
					.where(eq(s.contract.govId, input.govId))
					.get();

				return contract ? serializeContract(contract) : undefined;
			}

			return undefined;
		}),

	// the contracts directory, in one bounded query: the whole result set for a search, in the
	// order the sort control chose. The list renders what arrives and orders nothing itself.
	getMany: procedure.public
		.input(z.object({ search: z.string().optional(), sort: ContractSortSchema.optional() }))
		.query(async ({ input, ctx }) => {
			const search = input.search?.trim();

			const contracts = await ctx.db
				.select({
					contract: s.contract,
					tenantName: s.tenant.name,
					tenantPhone: s.tenant.phone,
					paymentCount: contractPaymentCount.as('paymentCount')
				})
				.from(s.contract)
				.innerJoin(s.tenant, eq(s.contract.tenantId, s.tenant.id))
				.where(search ? contractSearchCondition(search) : undefined)
				.orderBy(...contractOrderBy(input.sort));

			return contracts.map(({ contract, tenantName, tenantPhone, paymentCount }) => ({
				...serializeContract(contract, tenantName, tenantPhone),
				paymentCount
			}));
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

				await reconcileTouched(ctx.db, now, { contractIds: [input.contractId], unitIds });

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

				await reconcileTouched(ctx.db, now, {
					contractIds: [input.contractId],
					unitIds: [input.unitId]
				});

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
