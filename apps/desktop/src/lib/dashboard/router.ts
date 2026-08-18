import * as s from '$lib/platform/database/schema';
import { type Contract } from '$lib/platform/database/schema';
import { FILTER_PERIODS, toPeriodRange } from '$lib/api/period';
import { procedure } from '$lib/api/trpc';
import { isPaymentWithinPeriod } from '$lib/payment/period';
import { getExpectedAmountBy, getExpectedAmountInRange } from '$lib/contract/contract';
import { serializeContract } from '$lib/contract/serialize';
import {
	isContractIncludedInDashboardPortfolio,
	takeEntriesShownPerRank
} from '$lib/dashboard/dashboard';
import {
	compareContractsByRank,
	getContractRank,
	isContractEndingSoon,
	summarizeContractRanks,
	type ContractRank,
	type ContractRankSummary
} from '$lib/contract/rank';
import { eq, sql } from 'drizzle-orm';
import z from 'zod';

/**
 * DASHBOARD ROUTER
 *
 * the landing screen's read, mounted by the contract router at `contract.dashboard` — it
 * answers entirely about contracts, and moving the path would have made a relocation into
 * an interface change.
 *
 * It never loads payment rows. What a contract owes today is everything expected by now
 * minus the materialized `paid_amount`, and the one figure that needs payments is a scalar
 * sum, so the screen's cost is a function of how many contracts exist rather than of how
 * many payments have ever been recorded.
 *
 * What it *returns* is bounded by what the screen paints: a few entries per rank, beside
 * summaries that still describe every contract under each rank. The database read stays
 * linear in contracts, as ADR 0014 accepted — it is the response that narrows.
 */

/** One contract needing action, as a rank's rows render it. */
type DashboardQueueEntry = {
	id: string;
	govId: string;
	status: Contract['status'];
	rank: ContractRank;
	tenantName: string;
	tenantPhone: string;
	outstandingAmount: number;
	contractEnd: number;
	/** Set on a contract filed under the money that also ends inside the notice window. */
	isEndingSoon: boolean;
};

/** The portfolio figures the screen's band carries, and nothing else. */
type DashboardSummary = {
	/**
	 * what was expected and what came in, over the period asked about.
	 *
	 * Named for what they are rather than for a month: the screen used to be able to answer about
	 * the current one and nothing else, so *this month* was part of what the figures meant.
	 */
	money: { due: number; collected: number };
	occupancy: { totalUnits: number; occupiedUnits: number };
};

type DashboardData = {
	endingSoonNoticeDays: number;
	queue: DashboardQueueEntry[];
	ranks: ContractRankSummary[];
	summary: DashboardSummary;
};

/**
 * What the screen may be asked, which is only ever *when*.
 *
 * Optional, and optional inside: the landing screen is opened without asking for anything, and
 * the answer it gets then is the current month — the one thing it could answer about before it
 * took a period at all.
 */
const DashboardInputSchema = z
	.object({
		/** which span of time the money figures answer about, from the vocabulary the lists offer. */
		period: z.enum(FILTER_PERIODS).optional()
	})
	.optional();

export default procedure.public
	.input(DashboardInputSchema)
	.query(async ({ input, ctx }): Promise<DashboardData> => {
		const now = ctx.clock.now();
		const range = toPeriodRange(input?.period ?? 'this-month', now);
		const settings = await ctx.host.settings.get();

		const contracts = await ctx.db
			.select({
				contract: s.contract,
				tenantName: s.tenant.name,
				tenantPhone: s.tenant.phone
			})
			.from(s.contract)
			.innerJoin(s.tenant, eq(s.contract.tenantId, s.tenant.id));

		const ranked = contracts
			.flatMap(({ contract, tenantName, tenantPhone }): DashboardQueueEntry[] => {
				const serializedContract = serializeContract(contract);
				const outstandingAmount = Math.max(
					getExpectedAmountBy(contract, now) - serializedContract.paidAmount,
					0
				);
				const rank = getContractRank(
					serializedContract.status,
					contract.end,
					outstandingAmount,
					now,
					settings.endingSoonNoticeDays
				);

				if (!rank) {
					return [];
				}

				return [
					{
						id: contract.id,
						govId: serializedContract.govId,
						status: serializedContract.status,
						rank,
						tenantName,
						tenantPhone,
						outstandingAmount,
						contractEnd: serializedContract.end,
						isEndingSoon: isContractEndingSoon(
							serializedContract.status,
							contract.end,
							now,
							settings.endingSoonNoticeDays
						)
					}
				];
			})
			.sort(compareContractsByRank);

		// summarized before the entries are capped, so a rank's count and total describe every
		// contract under it. They are what the screen's way through to the rest is figured from.
		const ranks = summarizeContractRanks(ranked);

		// the band's figures describe the portfolio, so they are read over every contract rather
		// than over the ranked ones. Only the columns the month's arithmetic needs.
		const portfolio = await ctx.db
			.select({
				status: s.contract.status,
				start: s.contract.start,
				end: s.contract.end,
				interval: s.contract.interval,
				cost: s.contract.cost
			})
			.from(s.contract);

		const due = portfolio
			.filter(({ status }) => isContractIncludedInDashboardPortfolio(status))
			.reduce(
				(sum, contract) => sum + getExpectedAmountInRange(contract, range.start, range.end),
				0
			);

		// the same condition the payment statement is read with, imported rather than written again:
		// the criterion this answers is that the two surfaces *agree*, and two clauses written to one
		// intention are two chances to write it differently. It also fixes what the pair of bounds
		// here used to do — `<= end` at midnight dropped every payment made during the last day of
		// the month.
		const collected = await ctx.db
			.select({ amount: sql<number>`coalesce(sum(${s.payment.amount}), 0)` })
			.from(s.payment)
			.where(isPaymentWithinPeriod(input?.period ?? 'this-month', now))
			.get();

		const occupancy = await ctx.db
			.select({
				totalUnits: sql<number>`count(${s.unit.id})`,
				occupiedUnits: sql<number>`count(case when ${s.unit.status} = 'occupied' then 1 end)`
			})
			.from(s.unit)
			.get();

		return {
			endingSoonNoticeDays: settings.endingSoonNoticeDays,
			queue: takeEntriesShownPerRank(ranked),
			ranks,
			summary: {
				money: { due, collected: collected?.amount ?? 0 },
				occupancy: {
					totalUnits: occupancy?.totalUnits ?? 0,
					occupiedUnits: occupancy?.occupiedUnits ?? 0
				}
			}
		};
	});
