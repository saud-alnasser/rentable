import * as s from '$lib/platform/database/schema';
import { type Contract } from '$lib/platform/database/schema';
import { FILTER_PERIODS, isWithinPeriod, toPeriodRange } from '$lib/date';
import { procedure, router } from '$lib/api/trpc';
import {
	getExpectedAmountBy,
	getExpectedAmountInRange,
	serializeContract,
	compareContractsByRank,
	getContractRank,
	getDueSoonCycle,
	getRenewedContractIds,
	isContractEndingSoon,
	summarizeContractRanks,
	type ContractRank,
	type ContractRankSummary
} from '$lib/contract';
import {
	isContractIncludedInDashboardPortfolio,
	takeEntriesShownPerRank
} from '$lib/dashboard/dashboard';
import { permits, type Flag } from '@rentable/workspace-permission';
import { eq, sql } from 'drizzle-orm';
import z from 'zod';

/**
 * DASHBOARD ROUTER
 *
 * the landing screen's read, `dashboard.get`, mounted at the root like every feature's router.
 * *It was mounted by the contract router at `contract.dashboard`, because it answers entirely
 * about contracts, until effort 840 flattened the router tree.*
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
	/**
	 * who holds the contract, absent for a member who may not view tenants (effort 838,
	 * requirement 10).
	 */
	tenantName?: string;
	tenantPhone?: string;
	outstandingAmount: number;
	contractEnd: number;
	/** Set on a contract filed under the money that also ends inside the notice window. */
	isEndingSoon: boolean;
	/**
	 * On a due-soon contract, the cycle coming due: the day it falls due and what of it is unpaid.
	 * A due-soon contract owes nothing today, so this is the amount its row states in place of one.
	 */
	comingDue?: { due: number; amount: number };
};

/**
 * The portfolio figures the screen's band carries, and nothing else.
 *
 * Each figure is absent where the member may not view the kind it is read from (effort 838,
 * requirement 10): what was due is the contracts', what came in the payments', and the occupancy
 * the units'.
 */
type DashboardSummary = {
	/**
	 * what was expected and what came in, over the period asked about.
	 *
	 * Named for what they are rather than for a month: the screen used to be able to answer about
	 * the current one and nothing else, so *this month* was part of what the figures meant.
	 */
	/**
	 * `collected` is every payment received in the period, as recorded, a contract terminated
	 * since included, and `returned` the refunds dated in it. Neither is netted from the other,
	 * and `returned` is answered only when something was (effort 854, requirement 28).
	 */
	money: { due?: number; collected?: number; returned?: number };
	occupancy?: { totalUnits: number; occupiedUnits: number };
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

/**
 * **Open to every member, and leaving out what they may not view** (effort 838, requirement 10).
 * The landing screen is where everybody arrives, so refusing it for want of one kind would refuse
 * the application. A member without `viewContract` is answered with no queue, no ranks and no
 * figure due; one without `viewPayment` with no figure collected; one without `viewUnit` with no
 * occupancy; and one without `viewTenant` with a queue that names nobody. What is left out is not
 * returned.
 */
const get = procedure.member
	.input(DashboardInputSchema)
	.query(async ({ input, ctx }): Promise<DashboardData> => {
		const now = ctx.clock.now();
		const range = toPeriodRange(input?.period ?? 'this-month', now);
		const settings = await ctx.host.settings.get();
		const views = (flag: Flag) => permits(ctx.identity.permissions, flag);

		const contracts = !views('viewContract')
			? []
			: await ctx.db
					.select({
						contract: s.contract,
						tenantName: s.tenant.name,
						tenantPhone: s.tenant.phone
					})
					.from(s.contract)
					.innerJoin(s.tenant, eq(s.contract.tenantId, s.tenant.id));

		// the contracts renewed, from the rows just read: the read holds every contract, so it
		// holds every successor (effort 861, requirement 7).
		const renewedIds = getRenewedContractIds(contracts.map(({ contract }) => contract));

		const ranked = contracts
			.flatMap(({ contract: row, tenantName, tenantPhone }): DashboardQueueEntry[] => {
				const contract = { ...row, renewed: renewedIds.has(row.id) };
				const serializedContract = serializeContract(row);
				const outstandingAmount = Math.max(
					getExpectedAmountBy(contract, now) - serializedContract.paidAmount,
					0
				);
				const rank = getContractRank(
					contract,
					serializedContract.paidAmount,
					now,
					settings.endingSoonNoticeDays
				);

				if (!rank) {
					return [];
				}

				const comingDue =
					rank === 'due-soon'
						? getDueSoonCycle(contract, serializedContract.paidAmount, now)
						: undefined;

				return [
					{
						id: contract.id,
						govId: serializedContract.govId,
						status: serializedContract.status,
						rank,
						...(views('viewTenant') ? { tenantName, tenantPhone } : {}),
						outstandingAmount,
						contractEnd: serializedContract.end,
						isEndingSoon: isContractEndingSoon(contract, now, settings.endingSoonNoticeDays),
						...(comingDue
							? { comingDue: { due: comingDue.due.getTime(), amount: comingDue.amount } }
							: {})
					}
				];
			})
			.sort((left, right) =>
				compareContractsByRank(
					{ ...left, tenantName: left.tenantName ?? '', nextDue: left.comingDue?.due },
					{ ...right, tenantName: right.tenantName ?? '', nextDue: right.comingDue?.due }
				)
			);

		// summarized before the entries are capped, so a rank's count and total describe every
		// contract under it. They are what the screen's way through to the rest is figured from.
		const ranks = summarizeContractRanks(ranked);

		// the band's figures describe the portfolio, so they are read over every contract rather
		// than over the ranked ones. Only the columns the month's arithmetic needs.
		const portfolio = !views('viewContract')
			? []
			: await ctx.db
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
		//
		// one sum per direction, so money paid back to a tenant is its own figure rather than
		// counted as money that came in.
		const moved = !views('viewPayment')
			? undefined
			: await ctx.db
					.select({
						direction: s.payment.direction,
						amount: sql<number>`coalesce(sum(${s.payment.amount}), 0)`
					})
					.from(s.payment)
					.where(isWithinPeriod(s.payment.date, input?.period ?? 'this-month', now))
					.groupBy(s.payment.direction);

		const movedIn = (direction: s.PaymentDirection) =>
			moved?.find((sum) => sum.direction === direction)?.amount ?? 0;
		const collected = movedIn('received');
		const returned = movedIn('refund');

		const occupancy = !views('viewUnit')
			? undefined
			: await ctx.db
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
				money: {
					...(views('viewContract') ? { due } : {}),
					...(views('viewPayment') ? { collected } : {}),
					...(views('viewPayment') && returned > 0 ? { returned } : {})
				},
				...(views('viewUnit')
					? {
							occupancy: {
								totalUnits: occupancy?.totalUnits ?? 0,
								occupiedUnits: occupancy?.occupiedUnits ?? 0
							}
						}
					: {})
			}
		};
	});

export default router({ get });
