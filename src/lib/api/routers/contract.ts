import {
	deriveContractStatus,
	deriveUnitStatuses,
	ensureContractDeletable,
	ensureContractIsNotTerminated,
	ensureContractPaymentsCreatable,
	ensureContractTerminable,
	ensureContractUnterminable,
	ensureContractUnitsAreMutable,
	ensureGovIdAvailable,
	ensurePeriodDoesNotOverlapAssignments,
	ensureUnitsAssignable,
	ensureValidContractInput,
	ensureValidPaymentAmount,
	getConflictingAssignedUnitIds,
	getContractPaymentSummary,
	getExpectedAmountInRange,
	getOutstandingExpectedAmount,
	groupPaymentsByContractId,
	hasSameUtcDateRange
} from '$lib/api/contract';
import type { Database } from '$lib/api/context';
import * as s from '$lib/api/database/schema';
import {
	ContractSchema,
	PaymentSchema,
	type Contract,
	type Payment
} from '$lib/api/database/schema';
import { toUtcDay } from '$lib/api/date';
import { reconcile } from '$lib/api/reconcile';
import { autosync, procedure, router } from '$lib/api/trpc';
import {
	getCollectionProgress,
	getDashboardFollowUpAmount,
	getDashboardRate,
	getOccupancyRate,
	isContractEndingSoon,
	isContractIncludedInDashboardPortfolio,
	shouldIncludeDashboardFollowUp
} from '$lib/api/utils/dashboard';
import { PaginationSchema, resolvePagination, toPaginatedResult } from '$lib/api/utils/pagination';
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

type DbContract = typeof s.contract.$inferSelect;
type DbPayment = typeof s.payment.$inferSelect;
type SerializedContract = Omit<Contract, 'govId'> & {
	govId: string;
	tenantName?: string;
	tenantPhone?: string;
	paidAmount: number;
	expectedAmount: number;
};

type DashboardSummary = {
	contracts: {
		total: number;
		scheduled: number;
		active: number;
		fulfilled: number;
		expired: number;
		defaulted: number;
		terminated: number;
		endingSoon: number;
	};
	money: {
		dueThisMonth: number;
		collectedThisMonth: number;
		remainingThisMonth: number;
		outstandingNow: number;
		totalExpectedAmount: number;
		monthlyCollectionRate: number;
		overallCollectionRate: number;
	};
	occupancy: {
		totalUnits: number;
		occupiedUnits: number;
		vacantUnits: number;
		occupancyRate: number;
		vacancyRate: number;
	};
};

type DashboardFollowUp = {
	contractId: number;
	govId: string;
	status: Contract['status'];
	interval: Contract['interval'];
	tenantName: string;
	tenantPhone: string;
	followUpAmount: number;
	dueNowAmount: number;
	outstandingAmount: number;
	paidAmount: number;
	collectedThisMonth: number;
	contractEnd: number;
};

type DashboardEndingSoonContract = {
	contractId: number;
	govId: string;
	status: Contract['status'];
	interval: Contract['interval'];
	tenantName: string;
	tenantPhone: string;
	contractEnd: number;
};

type DashboardData = {
	generatedAt: number;
	monthLabel: string;
	endingSoonNoticeDays: number;
	summary: DashboardSummary;
	followUps: DashboardFollowUp[];
	endingSoonContracts: DashboardEndingSoonContract[];
};

function serializeContract(
	record: DbContract,
	now: number,
	paymentsByContractId: Map<number, DbPayment[]> = new Map(),
	tenantName?: string,
	tenantPhone?: string
): SerializedContract {
	const payments = paymentsByContractId.get(record.id) ?? [];
	const { paidAmount, expectedAmount } = getContractPaymentSummary(record, payments);

	const serializedContract: SerializedContract = {
		id: record.id,
		govId: record.govId ?? '',
		status: deriveContractStatus(record, payments, now),
		start: record.start.getTime(),
		end: record.end.getTime(),
		interval: record.interval,
		cost: record.cost,
		tenantId: record.tenantId,
		paidAmount,
		expectedAmount
	};

	if (tenantName !== undefined) {
		serializedContract.tenantName = tenantName;
	}

	if (tenantPhone !== undefined) {
		serializedContract.tenantPhone = tenantPhone;
	}

	return serializedContract;
}

function serializePayment(record: typeof s.payment.$inferSelect): Payment {
	return {
		id: record.id,
		date: record.date.getTime(),
		amount: record.amount,
		contractId: record.contractId
	};
}

const paymentSearchDateFormatter = new Intl.DateTimeFormat('en-GB', {
	dateStyle: 'medium',
	timeZone: 'UTC'
});

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

function matchesPaymentSearch(payment: Payment, search: string) {
	return [String(payment.amount), paymentSearchDateFormatter.format(new Date(payment.date))].some(
		(value) => value.toLowerCase().includes(search)
	);
}

function getCurrentMonthBounds(now: number) {
	const today = toUtcDay(now);
	const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
	const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0));

	return {
		start,
		end,
		label: new Intl.DateTimeFormat('en-US', {
			month: 'long',
			year: 'numeric',
			timeZone: 'UTC'
		}).format(start)
	};
}

function isWithinUtcRange(value: Date, rangeStart: Date, rangeEnd: Date) {
	const normalizedValue = toUtcDay(value).getTime();

	return normalizedValue >= rangeStart.getTime() && normalizedValue <= rangeEnd.getTime();
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

	dashboard: procedure.public.query(async ({ ctx }): Promise<DashboardData> => {
		const now = ctx.clock.now();
		const today = toUtcDay(now);
		const month = getCurrentMonthBounds(now);
		const settings = await ctx.host.settings.get();

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

		const contexts = contracts.map(({ contract, tenantName, tenantPhone }) => {
			const contractPayments = paymentsByContractId.get(contract.id) ?? [];
			const serializedContract = serializeContract(contract, now, paymentsByContractId);
			const collectedThisMonth = contractPayments
				.filter((payment) => isWithinUtcRange(payment.date, month.start, month.end))
				.reduce((sum, payment) => sum + payment.amount, 0);
			const monthDueAmount = getExpectedAmountInRange(contract, month.start, month.end);
			const dueNowAmount = getExpectedAmountInRange(contract, month.start, today);
			const outstandingAmount = getOutstandingExpectedAmount(contract, contractPayments, now);

			return {
				contract,
				tenantName,
				tenantPhone,
				serializedContract,
				collectedThisMonth,
				monthDueAmount,
				dueNowAmount,
				outstandingAmount
			};
		});

		const followUps = contexts
			.filter(({ dueNowAmount, outstandingAmount, serializedContract }) =>
				shouldIncludeDashboardFollowUp(serializedContract.status, dueNowAmount, outstandingAmount)
			)
			.map(
				({
					contract,
					tenantName,
					tenantPhone,
					serializedContract,
					collectedThisMonth,
					dueNowAmount,
					outstandingAmount
				}): DashboardFollowUp => ({
					contractId: contract.id,
					govId: serializedContract.govId,
					status: serializedContract.status,
					interval: contract.interval,
					tenantName,
					tenantPhone,
					followUpAmount: getDashboardFollowUpAmount(
						serializedContract.status,
						dueNowAmount,
						outstandingAmount
					),
					dueNowAmount,
					outstandingAmount,
					paidAmount: serializedContract.paidAmount,
					collectedThisMonth,
					contractEnd: serializedContract.end
				})
			)
			.sort(
				(left, right) =>
					right.outstandingAmount - left.outstandingAmount ||
					left.contractEnd - right.contractEnd ||
					left.tenantName.localeCompare(right.tenantName)
			);

		const endingSoonContracts = contexts.filter(({ contract, serializedContract }) =>
			isContractEndingSoon(
				serializedContract.status,
				contract.end,
				now,
				settings.endingSoonNoticeDays
			)
		);
		const serializedEndingSoonContracts = endingSoonContracts
			.map(
				({
					contract,
					tenantName,
					tenantPhone,
					serializedContract
				}): DashboardEndingSoonContract => ({
					contractId: contract.id,
					govId: serializedContract.govId,
					status: serializedContract.status,
					interval: contract.interval,
					tenantName,
					tenantPhone,
					contractEnd: serializedContract.end
				})
			)
			.sort(
				(left, right) =>
					left.contractEnd - right.contractEnd || left.tenantName.localeCompare(right.tenantName)
			);
		const portfolioContexts = contexts.filter(({ serializedContract }) =>
			isContractIncludedInDashboardPortfolio(serializedContract.status)
		);

		const units = await ctx.db.select({ id: s.unit.id, status: s.unit.status }).from(s.unit);
		const occupiedUnits = units.filter((unit) => unit.status === 'occupied').length;
		const vacantUnits = Math.max(units.length - occupiedUnits, 0);
		const totalPaidAmount = portfolioContexts.reduce(
			(sum, item) => sum + item.serializedContract.paidAmount,
			0
		);
		const totalExpectedAmount = portfolioContexts.reduce(
			(sum, item) => sum + item.serializedContract.expectedAmount,
			0
		);
		const dueThisMonth = portfolioContexts.reduce((sum, item) => sum + item.monthDueAmount, 0);
		const collectedThisMonth = portfolioContexts.reduce(
			(sum, item) => sum + item.collectedThisMonth,
			0
		);
		const remainingThisMonth = portfolioContexts.reduce(
			(sum, item) =>
				sum + getCollectionProgress(item.monthDueAmount, item.collectedThisMonth).remainingAmount,
			0
		);
		const coveredThisMonth = portfolioContexts.reduce(
			(sum, item) =>
				sum + getCollectionProgress(item.monthDueAmount, item.collectedThisMonth).coveredAmount,
			0
		);
		const outstandingNow = portfolioContexts.reduce((sum, item) => sum + item.outstandingAmount, 0);

		const summary: DashboardSummary = {
			contracts: {
				total: portfolioContexts.length,
				scheduled: contexts.filter(
					({ serializedContract }) => serializedContract.status === 'scheduled'
				).length,
				active: contexts.filter(({ serializedContract }) => serializedContract.status === 'active')
					.length,
				fulfilled: contexts.filter(
					({ serializedContract }) => serializedContract.status === 'fulfilled'
				).length,
				expired: contexts.filter(
					({ serializedContract }) => serializedContract.status === 'expired'
				).length,
				defaulted: contexts.filter(
					({ serializedContract }) => serializedContract.status === 'defaulted'
				).length,
				terminated: contexts.filter(
					({ serializedContract }) => serializedContract.status === 'terminated'
				).length,
				endingSoon: endingSoonContracts.length
			},
			money: {
				dueThisMonth,
				collectedThisMonth,
				remainingThisMonth,
				outstandingNow,
				totalExpectedAmount,
				monthlyCollectionRate: getDashboardRate(dueThisMonth, coveredThisMonth),
				overallCollectionRate: getDashboardRate(totalExpectedAmount, totalPaidAmount)
			},
			occupancy: {
				totalUnits: units.length,
				occupiedUnits,
				vacantUnits,
				occupancyRate: getOccupancyRate(units.length, occupiedUnits),
				vacancyRate: getDashboardRate(units.length, vacantUnits)
			}
		};

		return {
			generatedAt: now,
			monthLabel: month.label,
			endingSoonNoticeDays: settings.endingSoonNoticeDays,
			summary,
			followUps,
			endingSoonContracts: serializedEndingSoonContracts
		};
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

	payments: {
		getMany: procedure.public
			.input(PaymentSchema.pick({ contractId: true }))
			.query(async ({ input, ctx }) => {
				const payments = await ctx.db
					.select()
					.from(s.payment)
					.where(eq(s.payment.contractId, input.contractId));

				return payments.map(serializePayment);
			}),

		getPaginated: procedure.public
			.input(PaginationSchema.extend({ contractId: z.number(), search: z.string().optional() }))
			.query(async ({ input, ctx }) => {
				const { limit, offset } = resolvePagination(input);
				const search = input.search?.trim().toLowerCase();

				if (search) {
					const payments = await ctx.db
						.select()
						.from(s.payment)
						.where(eq(s.payment.contractId, input.contractId))
						.orderBy(asc(s.payment.id));
					const serializedPayments = payments.map(serializePayment);

					return toPaginatedResult(
						serializedPayments.filter((payment) => matchesPaymentSearch(payment, search)),
						limit,
						offset
					);
				}

				const payments = await ctx.db
					.select()
					.from(s.payment)
					.where(eq(s.payment.contractId, input.contractId))
					.orderBy(asc(s.payment.id))
					.limit(limit + 1)
					.offset(offset);

				return toPaginatedResult(payments.map(serializePayment), limit, offset);
			}),

		create: procedure.public
			.use(autosync())
			.input(PaymentSchema.omit({ id: true }))
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
				ensureContractPaymentsCreatable(
					contract,
					await selectPaymentsForContract(ctx.db, contract.id)
				);
				ensureValidPaymentAmount(input.amount);

				const created = await ctx.db
					.insert(s.payment)
					.values({
						...input,
						date: new Date(input.date)
					})
					.returning()
					.get();

				await reconcile(ctx.db, now);

				return serializePayment(created);
			}),

		update: procedure.public
			.use(autosync())
			.input(PaymentSchema.pick({ id: true, date: true, amount: true }))
			.mutation(async ({ input, ctx }) => {
				const now = ctx.clock.now();

				const existingPayment = await ctx.db
					.select()
					.from(s.payment)
					.where(eq(s.payment.id, input.id))
					.get();

				if (!existingPayment) {
					throw new TRPCError({
						code: 'BAD_REQUEST',
						message: 'payment does not exist'
					});
				}

				const contract = await ctx.db
					.select()
					.from(s.contract)
					.where(eq(s.contract.id, existingPayment.contractId))
					.get();

				if (!contract) {
					throw new TRPCError({
						code: 'BAD_REQUEST',
						message: 'contract does not exist'
					});
				}

				ensureContractIsNotTerminated(contract.status);
				ensureValidPaymentAmount(input.amount);

				const updated = await ctx.db
					.update(s.payment)
					.set({
						date: new Date(input.date),
						amount: input.amount
					})
					.where(eq(s.payment.id, input.id))
					.returning()
					.get();

				await reconcile(ctx.db, now);

				return serializePayment(updated);
			}),

		delete: procedure.public
			.use(autosync())
			.input(PaymentSchema.pick({ id: true }))
			.mutation(async ({ input, ctx }) => {
				const now = ctx.clock.now();

				const existingPayment = await ctx.db
					.select()
					.from(s.payment)
					.where(eq(s.payment.id, input.id))
					.get();

				if (!existingPayment) {
					return existingPayment;
				}

				const contract = await ctx.db
					.select()
					.from(s.contract)
					.where(eq(s.contract.id, existingPayment.contractId))
					.get();

				if (!contract) {
					throw new TRPCError({
						code: 'BAD_REQUEST',
						message: 'contract does not exist'
					});
				}

				ensureContractIsNotTerminated(contract.status);

				const deleted = await ctx.db
					.delete(s.payment)
					.where(eq(s.payment.id, input.id))
					.returning()
					.get();

				await reconcile(ctx.db, now);

				return deleted ? serializePayment(deleted) : deleted;
			})
	}
});
