import * as s from '$lib/api/database/schema';
import { type Contract } from '$lib/api/database/schema';
import { getCurrentMonthBounds, isWithinUtcRange, toUtcDay } from '$lib/api/date';
import { procedure } from '$lib/api/trpc';
import { getExpectedAmountInRange, getOutstandingExpectedAmount } from '$lib/contract/contract';
import { serializeContract } from '$lib/contract/serialize';
import {
	getCollectionProgress,
	getDashboardFollowUpAmount,
	getDashboardRate,
	getOccupancyRate,
	isContractEndingSoon,
	isContractIncludedInDashboardPortfolio,
	shouldIncludeDashboardFollowUp
} from '$lib/dashboard/dashboard';
import { groupPaymentsByContractId } from '$lib/payment/payment';
import { eq, inArray } from 'drizzle-orm';

/**
 * DASHBOARD ROUTER
 *
 * the one aggregation the landing screen reads, mounted by the contract router at
 * `contract.dashboard` — it answers entirely about contracts, and moving the path would
 * have made a relocation into an interface change.
 */

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

export default procedure.public.query(async ({ ctx }): Promise<DashboardData> => {
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
			({ contract, tenantName, tenantPhone, serializedContract }): DashboardEndingSoonContract => ({
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
			expired: contexts.filter(({ serializedContract }) => serializedContract.status === 'expired')
				.length,
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
});
