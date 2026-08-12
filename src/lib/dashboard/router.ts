import * as s from '$lib/platform/database/schema';
import { type Contract } from '$lib/platform/database/schema';
import { getCurrentMonthBounds } from '$lib/api/date';
import { procedure } from '$lib/api/trpc';
import { getExpectedAmountBy, getExpectedAmountInRange } from '$lib/contract/contract';
import { serializeContract } from '$lib/contract/serialize';
import { isContractIncludedInDashboardPortfolio } from '$lib/dashboard/dashboard';
import {
	compareContractsByRank,
	getContractRank,
	isContractEndingSoon,
	summarizeContractRanks,
	type ContractRank,
	type ContractRankSummary
} from '$lib/contract/rank';
import { and, eq, gte, lte, sql, type AnyColumn, type SQL } from 'drizzle-orm';
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
 */

/** One contract needing action, as the queue's rows render it. */
type DashboardQueueEntry = {
	id: number;
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

/** The two figures above the queue, and nothing else. */
type DashboardSummary = {
	money: { dueThisMonth: number; collectedThisMonth: number };
	occupancy: { totalUnits: number; occupiedUnits: number };
};

type DashboardData = {
	endingSoonNoticeDays: number;
	queue: DashboardQueueEntry[];
	ranks: ContractRankSummary[];
	summary: DashboardSummary;
};

// every field the queue can be searched by, whether or not the row shows it.
//
// `%` and `_` are LIKE's own wildcards, so a term carrying either is escaped before it
// becomes a pattern: a user searching for "50%" is looking for that text, not asking to
// match everything.
function queueSearchCondition(search: string) {
	const pattern = `%${search.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
	const like = (column: SQL | AnyColumn) =>
		sql`lower(cast(${column} as text)) like lower(${pattern}) escape '\\'`;

	return sql.join(
		[
			like(s.contract.govId),
			like(s.tenant.name),
			like(s.tenant.phone),
			like(s.contract.status),
			like(s.contract.interval),
			like(s.contract.cost)
		],
		sql` or `
	);
}

export default procedure.public
	.input(z.object({ search: z.string().optional() }).optional())
	.query(async ({ input, ctx }): Promise<DashboardData> => {
		const now = ctx.clock.now();
		const month = getCurrentMonthBounds(now);
		const settings = await ctx.host.settings.get();
		const search = input?.search?.trim();

		const searched = await ctx.db
			.select({
				contract: s.contract,
				tenantName: s.tenant.name,
				tenantPhone: s.tenant.phone
			})
			.from(s.contract)
			.innerJoin(s.tenant, eq(s.contract.tenantId, s.tenant.id))
			.where(search ? queueSearchCondition(search) : undefined);

		const queue = searched
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

		// the strip is a portfolio figure, so it is read over every contract rather than over
		// the ones a search left: a total that moved as the user typed would be describing the
		// search rather than the month. Only the columns the month's arithmetic needs.
		const portfolio = await ctx.db
			.select({
				status: s.contract.status,
				start: s.contract.start,
				end: s.contract.end,
				interval: s.contract.interval,
				cost: s.contract.cost
			})
			.from(s.contract);

		const dueThisMonth = portfolio
			.filter(({ status }) => isContractIncludedInDashboardPortfolio(status))
			.reduce(
				(sum, contract) => sum + getExpectedAmountInRange(contract, month.start, month.end),
				0
			);

		const collected = await ctx.db
			.select({ amount: sql<number>`coalesce(sum(${s.payment.amount}), 0)` })
			.from(s.payment)
			.where(and(gte(s.payment.date, month.start), lte(s.payment.date, month.end)))
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
			queue,
			ranks: summarizeContractRanks(queue),
			summary: {
				money: { dueThisMonth, collectedThisMonth: collected?.amount ?? 0 },
				occupancy: {
					totalUnits: occupancy?.totalUnits ?? 0,
					occupiedUnits: occupancy?.occupiedUnits ?? 0
				}
			}
		};
	});
