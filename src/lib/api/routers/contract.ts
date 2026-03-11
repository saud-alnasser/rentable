import * as s from '$lib/api/database/schema';
import {
	ContractSchema,
	PaymentSchema,
	type Contract,
	type Payment
} from '$lib/api/database/schema';
import { procedure, router } from '$lib/api/trpc';
import {
	canManuallyTerminateContractStatus,
	canUnterminateContractStatus,
	deriveContractStatus,
	deriveUnitStatus,
	getConflictingAssignedUnitIds,
	getContractPaymentSummary,
	getExpectedAmountInRange,
	getMinimumContractPeriodDays,
	getOutstandingExpectedAmount,
	hasSameUtcDateRange,
	hasValidContractPeriodForInterval,
	isContractPaidInFull,
	rangesOverlap
} from '$lib/api/utils/contract-status';
import {
	getCollectionProgress,
	getDashboardFollowUpAmount,
	getDashboardRate,
	getOccupancyRate,
	isContractIncludedInDashboardPortfolio,
	shouldIncludeDashboardFollowUp
} from '$lib/api/utils/dashboard';
import { sync, type DbClient } from '$lib/api/utils/sync';
import { TRPCError } from '@trpc/server';
import { and, eq, inArray, sql } from 'drizzle-orm';
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

const intervalLabels: Record<Contract['interval'], string> = {
	'1m': 'monthly',
	'3m': 'quarterly',
	'6m': 'semi-annual',
	'12m': 'annual'
};

function ensureValidDateRange(start: number, end: number) {
	if (end < start) {
		throw new TRPCError({
			code: 'BAD_REQUEST',
			message: 'end date must be after start date'
		});
	}
}

function ensureValidCost(cost: number) {
	if (cost <= 0) {
		throw new TRPCError({
			code: 'BAD_REQUEST',
			message: 'cost per payment must be greater than zero'
		});
	}
}

function ensureValidContractPeriod(input: Pick<Contract, 'start' | 'end' | 'interval'>) {
	if (!hasValidContractPeriodForInterval(input)) {
		throw new TRPCError({
			code: 'BAD_REQUEST',
			message: `contract period must be a whole number of ${getMinimumContractPeriodDays(input.interval)}-day ${intervalLabels[input.interval]} cycles`
		});
	}
}

function ensureValidContractInput(input: Pick<Contract, 'start' | 'end' | 'interval' | 'cost'>) {
	ensureValidDateRange(input.start, input.end);
	ensureValidContractPeriod(input);
	ensureValidCost(input.cost);
}

function ensureContractIsNotTerminated(status: Contract['status']) {
	if (status === 'terminated') {
		throw new TRPCError({
			code: 'BAD_REQUEST',
			message: 'terminated contracts are locked'
		});
	}
}

async function ensureContractUnitsAreMutable(db: DbClient, contractId: number) {
	const payment = await db
		.select({ id: s.payment.id })
		.from(s.payment)
		.where(eq(s.payment.contractId, contractId))
		.get();

	if (payment) {
		throw new TRPCError({
			code: 'BAD_REQUEST',
			message: 'cannot change contract units after payments have been registered'
		});
	}
}

async function ensureContractPaymentsCanBeCreated(db: DbClient, contract: DbContract) {
	const payments = await db.select().from(s.payment).where(eq(s.payment.contractId, contract.id));

	if (isContractPaidInFull(contract, payments)) {
		throw new TRPCError({
			code: 'BAD_REQUEST',
			message: 'cannot add payments once the required contract amount has been fully paid'
		});
	}
}

async function ensureAssignedUnitsDoNotOverlap(
	db: DbClient,
	contractId: number,
	start: number,
	end: number
) {
	const assignedUnits = (await db
		.select({ unitId: s.contractUnit.unitId })
		.from(s.contractUnit)
		.where(eq(s.contractUnit.contractId, contractId))) as Array<{ unitId: number }>;

	const unitIds = [...new Set(assignedUnits.map((assignment) => assignment.unitId))];

	if (unitIds.length === 0) {
		return;
	}

	const overlappingAssignments = (await db
		.select({
			unitId: s.contractUnit.unitId,
			contractId: s.contract.id,
			status: s.contract.status,
			start: s.contract.start,
			end: s.contract.end
		})
		.from(s.contractUnit)
		.innerJoin(s.contract, eq(s.contractUnit.contractId, s.contract.id))
		.where(inArray(s.contractUnit.unitId, unitIds))) as Array<{
		unitId: number;
		contractId: number;
		status: Contract['status'];
		start: Date;
		end: Date;
	}>;

	const conflictingAssignment = overlappingAssignments.find(
		(assignment) =>
			assignment.contractId !== contractId &&
			assignment.status !== 'terminated' &&
			rangesOverlap(assignment.start, assignment.end, start, end)
	);

	if (conflictingAssignment) {
		throw new TRPCError({
			code: 'BAD_REQUEST',
			message: 'assigned units overlap with another contract during the selected dates'
		});
	}
}

type DbContract = typeof s.contract.$inferSelect;
type DbPayment = typeof s.payment.$inferSelect;
type SerializedContract = Omit<Contract, 'govId'> & {
	govId: string;
	tenantName?: string;
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

type DashboardData = {
	generatedAt: number;
	monthLabel: string;
	summary: DashboardSummary;
	followUps: DashboardFollowUp[];
};

type ContractAssignmentRow = {
	unitId: number;
	contractId: number;
	status: DbContract['status'];
	start: DbContract['start'];
	end: DbContract['end'];
	interval: DbContract['interval'];
	cost: DbContract['cost'];
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
			contract: Pick<DbContract, 'status' | 'start' | 'end' | 'interval' | 'cost'>;
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

function serializeContract(
	record: DbContract,
	paymentsByContractId: Map<number, DbPayment[]> = new Map(),
	tenantName?: string
): SerializedContract {
	const payments = paymentsByContractId.get(record.id) ?? [];
	const { paidAmount, expectedAmount } = getContractPaymentSummary(record, payments);

	const serializedContract: SerializedContract = {
		id: record.id,
		govId: record.govId ?? '',
		status: deriveContractStatus(record, payments),
		start: record.start.getTime(),
		end: record.end.getTime(),
		interval: record.interval,
		cost: record.cost,
		tenantId: record.tenantId,
		paidAmount,
		expectedAmount
	};

	if (tenantName) {
		serializedContract.tenantName = tenantName;
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

function toUtcDay(value: Date | number) {
	const date = value instanceof Date ? value : new Date(value);

	return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addUtcDays(value: Date, days: number) {
	return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate() + days));
}

function getCurrentMonthBounds(now = Date.now()) {
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
	create: procedure.public.input(ContractCreateSchema).mutation(async ({ input, ctx }) => {
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
		const isGovIdUsed = normalizedGovId
			? await ctx.db.select().from(s.contract).where(eq(s.contract.govId, normalizedGovId)).get()
			: undefined;

		if (isGovIdUsed) {
			throw new TRPCError({
				code: 'BAD_REQUEST',
				message: 'government id is associated with another contract'
			});
		}

		const initialStatus = deriveContractStatus(
			{
				status: 'active',
				start: new Date(input.start),
				end: new Date(input.end),
				interval: input.interval,
				cost: input.cost
			},
			[]
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

		await sync(ctx.db);

		return serializeContract(created);
	}),

	update: procedure.public.input(ContractUpdateSchema).mutation(async ({ input, ctx }) => {
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
		const isGovIdUsed = normalizedGovId
			? await ctx.db
					.select()
					.from(s.contract)
					.where(sql`${s.contract.govId} = ${normalizedGovId} AND ${s.contract.id} != ${input.id}`)
					.get()
			: undefined;

		if (isGovIdUsed) {
			throw new TRPCError({
				code: 'BAD_REQUEST',
				message: 'government id is associated with another contract'
			});
		}

		const hasDateRangeChanged = !hasSameUtcDateRange(
			existingContract.start,
			existingContract.end,
			input.start,
			input.end
		);

		if (hasDateRangeChanged) {
			await ensureAssignedUnitsDoNotOverlap(ctx.db, input.id, input.start, input.end);
		}

		const existingPayments = await ctx.db
			.select()
			.from(s.payment)
			.where(eq(s.payment.contractId, input.id));
		const nextStatus = deriveContractStatus(
			{
				status: existingContract.status,
				start: new Date(input.start),
				end: new Date(input.end),
				interval: input.interval,
				cost: input.cost
			},
			existingPayments
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

		await sync(ctx.db);

		return serializeContract(updated);
	}),

	terminate: procedure.public
		.input(ContractSchema.pick({ id: true }))
		.mutation(async ({ input, ctx }) => {
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

			const payments = await ctx.db
				.select()
				.from(s.payment)
				.where(eq(s.payment.contractId, input.id));

			const currentStatus = deriveContractStatus(existingContract, payments);

			if (!canManuallyTerminateContractStatus(currentStatus)) {
				throw new TRPCError({
					code: 'BAD_REQUEST',
					message: 'only active, fulfilled, or past contracts can be terminated'
				});
			}

			const terminated = await ctx.db
				.update(s.contract)
				.set({ status: 'terminated' })
				.where(eq(s.contract.id, input.id))
				.returning()
				.get();

			await sync(ctx.db);

			return serializeContract(terminated);
		}),

	unterminate: procedure.public
		.input(ContractSchema.pick({ id: true }))
		.mutation(async ({ input, ctx }) => {
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

			if (!canUnterminateContractStatus(existingContract.status)) {
				throw new TRPCError({
					code: 'BAD_REQUEST',
					message: 'only terminated contracts can be unterminated'
				});
			}

			const payments = await ctx.db
				.select()
				.from(s.payment)
				.where(eq(s.payment.contractId, input.id));
			const restoredStatus = deriveContractStatus(
				{ ...existingContract, status: 'active' },
				payments
			);

			const restored = await ctx.db
				.update(s.contract)
				.set({ status: restoredStatus })
				.where(eq(s.contract.id, input.id))
				.returning()
				.get();

			await sync(ctx.db);

			return serializeContract(restored);
		}),

	delete: procedure.public
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

			if (units.length > 0) {
				throw new TRPCError({
					code: 'BAD_REQUEST',
					message: 'cannot delete contract with associated units'
				});
			}

			const payments = await ctx.db
				.select()
				.from(s.payment)
				.where(eq(s.payment.contractId, input.id));

			if (payments.length > 0) {
				throw new TRPCError({
					code: 'BAD_REQUEST',
					message: 'cannot delete contract with associated payments'
				});
			}

			const deleted = await ctx.db
				.delete(s.contract)
				.where(eq(s.contract.id, input.id))
				.returning()
				.get();

			return deleted ? serializeContract(deleted) : deleted;
		}),

	dashboard: procedure.public.query(async ({ ctx }): Promise<DashboardData> => {
		const now = Date.now();
		const today = toUtcDay(now);
		const month = getCurrentMonthBounds(now);
		const upcomingWindowEnd = addUtcDays(today, 30);

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
			const serializedContract = serializeContract(contract, paymentsByContractId);
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

		const endingSoonContracts = contexts.filter(({ contract, serializedContract }) => {
			const status = serializedContract.status;
			const contractEnd = toUtcDay(contract.end).getTime();
			const todayTime = today.getTime();

			return (
				(status === 'active' || status === 'fulfilled') &&
				contractEnd >= todayTime &&
				contractEnd <= upcomingWindowEnd.getTime()
			);
		});
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
			summary,
			followUps
		};
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

				if (!contract) {
					return undefined;
				}

				const payments = await ctx.db
					.select()
					.from(s.payment)
					.where(eq(s.payment.contractId, contract.id));

				return serializeContract(contract, groupPaymentsByContractId(payments));
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

				return serializeContract(contract, groupPaymentsByContractId(payments));
			}

			return undefined;
		}),

	getMany: procedure.public
		.input(z.object({ search: z.string().optional() }))
		.query(async ({ input, ctx }) => {
			const contracts = await ctx.db
				.select({
					contract: s.contract,
					tenantName: s.tenant.name
				})
				.from(s.contract)
				.innerJoin(s.tenant, eq(s.contract.tenantId, s.tenant.id));
			const contractIds = contracts.map(({ contract }) => contract.id);
			const payments = contractIds.length
				? await ctx.db.select().from(s.payment).where(inArray(s.payment.contractId, contractIds))
				: [];
			const paymentsByContractId = groupPaymentsByContractId(payments);
			const serializedContracts = contracts.map(({ contract, tenantName }) =>
				serializeContract(contract, paymentsByContractId, tenantName)
			);

			if (!input.search) {
				return serializedContracts;
			}

			const search = input.search.trim().toLowerCase();

			return serializedContracts.filter(
				(contract) =>
					(contract.govId ?? '').toLowerCase().includes(search) ||
					contract.status.toLowerCase().includes(search) ||
					contract.tenantName?.toLowerCase().includes(search)
			);
		}),

	units: {
		getMany: procedure.public.input(ContractUnitsGetManySchema).query(async ({ input, ctx }) => {
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

			const assignments = await ctx.db
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
		}),

		getVacantMany: procedure.public
			.input(ContractVacantUnitsGetManySchema)
			.query(async ({ input, ctx }) => {
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

				const assignments = await ctx.db
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

		assign: procedure.public.input(ContractUnitsAssignSchema).mutation(async ({ input, ctx }) => {
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
			await ensureContractUnitsAreMutable(ctx.db, input.contractId);

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

			const existingAssignments = await ctx.db
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

			const overlappingAssignments = getConflictingAssignedUnitIds(
				existingAssignments,
				contract,
				input.contractId
			);

			if (overlappingAssignments.size > 0) {
				throw new TRPCError({
					code: 'BAD_REQUEST',
					message: 'one or more selected units are already assigned to an overlapping contract'
				});
			}

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

			const assignments = await ctx.db
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
			const assignmentPayments = contractIds.length
				? await ctx.db.select().from(s.payment).where(inArray(s.payment.contractId, contractIds))
				: [];
			const assignedStatusByUnitId = getDerivedUnitStatuses(
				unitIds,
				assignments,
				groupPaymentsByContractId(assignmentPayments)
			);

			await sync(ctx.db);

			return assignedUnits.map((unit) => ({
				...unit,
				status: assignedStatusByUnitId.get(unit.id) ?? 'vacant'
			}));
		}),

		remove: procedure.public.input(ContractUnitRemoveSchema).mutation(async ({ input, ctx }) => {
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
			await ensureContractUnitsAreMutable(ctx.db, input.contractId);

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

			await sync(ctx.db);

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

		create: procedure.public
			.input(PaymentSchema.omit({ id: true }))
			.mutation(async ({ input, ctx }) => {
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
				await ensureContractPaymentsCanBeCreated(ctx.db, contract);

				if (input.amount <= 0) {
					throw new TRPCError({
						code: 'BAD_REQUEST',
						message: 'payment amount must be greater than zero'
					});
				}

				const created = await ctx.db
					.insert(s.payment)
					.values({
						...input,
						date: new Date(input.date)
					})
					.returning()
					.get();

				await sync(ctx.db);

				return serializePayment(created);
			}),

		update: procedure.public
			.input(PaymentSchema.pick({ id: true, date: true, amount: true }))
			.mutation(async ({ input, ctx }) => {
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

				if (input.amount <= 0) {
					throw new TRPCError({
						code: 'BAD_REQUEST',
						message: 'payment amount must be greater than zero'
					});
				}

				const updated = await ctx.db
					.update(s.payment)
					.set({
						date: new Date(input.date),
						amount: input.amount
					})
					.where(eq(s.payment.id, input.id))
					.returning()
					.get();

				await sync(ctx.db);

				return serializePayment(updated);
			}),

		delete: procedure.public
			.input(PaymentSchema.pick({ id: true }))
			.mutation(async ({ input, ctx }) => {
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

				await sync(ctx.db);

				return deleted ? serializePayment(deleted) : deleted;
			})
	}
});
