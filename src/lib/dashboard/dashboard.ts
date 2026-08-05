import type { Contract } from '$lib/platform/database/schema';
import { addUtcDays, toUtcDay, type DateLike } from '$lib/api/date';

/**
 * DASHBOARD
 *
 * the work queue's own rules: which group a contract belongs in today, the order the
 * groups and their contracts are read in, and what a group heading states. Nothing here
 * touches the database — the router fetches contracts and their materialized aggregates
 * and calls in, exactly as the contract domain module is used.
 */

export const DEFAULT_DASHBOARD_ENDING_SOON_NOTICE_DAYS = 60;

/**
 * The queue's groups, in the order the landing screen reads them: what is already late,
 * then what is behind, then what needs renewing. Position in this array is the order —
 * nothing else fixes it.
 */
export const DASHBOARD_QUEUE_GROUPS = ['overdue', 'owing', 'ending-soon'] as const;

/** One of the three ranks a contract needing action is filed under. */
export type DashboardQueueGroup = (typeof DASHBOARD_QUEUE_GROUPS)[number];

/** What ordering a queue entry against another needs of it. */
export type DashboardQueueOrder = {
	group: DashboardQueueGroup;
	outstandingAmount: number;
	contractEnd: number;
	tenantName: string;
};

/** What summarizing a group needs of the entries in it. */
export type DashboardQueueMembership = Pick<DashboardQueueOrder, 'group' | 'outstandingAmount'>;

/** A group heading: the rank, how many contracts are under it, and what they owe. */
export type DashboardQueueGroupSummary = {
	group: DashboardQueueGroup;
	contractCount: number;
	totalAmount: number;
};

export function isContractIncludedInDashboardPortfolio(status: Contract['status']) {
	return status !== 'terminated';
}

/**
 * Whether a group holds contracts that owe money.
 *
 * The split the whole surface turns on: a money group's contracts are in the queue because
 * of a debt, so they carry an amount and their rows record a payment, while a renewals
 * contract owes nothing by construction and does neither. Named here rather than in the
 * component because it is the same division `getDashboardQueueGroup` makes when it files a
 * contract — how each side is then *presented* is the component's.
 */
export function isDashboardMoneyGroup(group: DashboardQueueGroup) {
	return group !== 'ending-soon';
}

export function isContractEndingSoon(
	status: Contract['status'],
	contractEnd: DateLike,
	now: DateLike,
	noticeWindowDays: number = DEFAULT_DASHBOARD_ENDING_SOON_NOTICE_DAYS
) {
	if (status !== 'active' && status !== 'fulfilled') {
		return false;
	}

	const today = toUtcDay(now);
	const end = toUtcDay(contractEnd);
	const normalizedNoticeWindowDays = Math.max(Math.floor(noticeWindowDays), 0);

	return (
		end.getTime() >= today.getTime() &&
		end.getTime() <= addUtcDays(today, normalizedNoticeWindowDays).getTime()
	);
}

/**
 * The group a contract is filed under today, or `undefined` when it needs nothing.
 *
 * Money admits a contract on what it **owes today** — everything expected by now minus
 * everything ever paid — never on whether a cycle boundary happened to fall inside the
 * current calendar month. A quarterly contract two months into its quarter has nothing
 * due this month and can still be two full cycles behind.
 *
 * A terminated contract is in no group whatever it owes: termination locks the contract,
 * so the debt on one is a closed matter rather than work. A contract that owes money and
 * ends inside the notice window is filed under the money, which is what keeps one
 * contract to one row — `isContractEndingSoon` is what marks the second need on it.
 */
export function getDashboardQueueGroup(
	status: Contract['status'],
	contractEnd: DateLike,
	outstandingAmount: number,
	now: DateLike,
	noticeWindowDays: number = DEFAULT_DASHBOARD_ENDING_SOON_NOTICE_DAYS
): DashboardQueueGroup | undefined {
	if (status === 'terminated') {
		return undefined;
	}

	if (outstandingAmount > 0) {
		return toUtcDay(contractEnd).getTime() < toUtcDay(now).getTime() ? 'overdue' : 'owing';
	}

	return isContractEndingSoon(status, contractEnd, now, noticeWindowDays)
		? 'ending-soon'
		: undefined;
}

/**
 * Today's follow-up order: the groups in their own order, then the largest debt first
 * inside a money group and the soonest end first inside the renewals, tenant name
 * breaking either tie so a page of equal values is not in insertion order.
 */
export function compareDashboardQueueEntries(
	left: DashboardQueueOrder,
	right: DashboardQueueOrder
) {
	const groupDifference =
		DASHBOARD_QUEUE_GROUPS.indexOf(left.group) - DASHBOARD_QUEUE_GROUPS.indexOf(right.group);

	if (groupDifference !== 0) {
		return groupDifference;
	}

	if (left.group === 'ending-soon') {
		return left.contractEnd - right.contractEnd || left.tenantName.localeCompare(right.tenantName);
	}

	return (
		right.outstandingAmount - left.outstandingAmount ||
		left.contractEnd - right.contractEnd ||
		left.tenantName.localeCompare(right.tenantName)
	);
}

/**
 * One summary per group that holds something, in the groups' own order.
 *
 * A group nothing landed in is left out rather than summarized as zero: the list shell
 * derives a heading from the records under it, so an empty group has no heading for a
 * count to appear on, and the surface shows its empty state instead.
 *
 * **What admits a group is its contract count, never its money total.** A renewals
 * contract owes nothing by definition, so that group's total is always zero and the
 * heading does not show it — dropping a group on a zero total would empty the renewals
 * group of every contract in it.
 */
export function summarizeDashboardQueueGroups(
	entries: readonly DashboardQueueMembership[]
): DashboardQueueGroupSummary[] {
	return DASHBOARD_QUEUE_GROUPS.map((group) => {
		const members = entries.filter((entry) => entry.group === group);

		return {
			group,
			contractCount: members.length,
			totalAmount: members.reduce((sum, member) => sum + member.outstandingAmount, 0)
		};
	}).filter((summary) => summary.contractCount > 0);
}
