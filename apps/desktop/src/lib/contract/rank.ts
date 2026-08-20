import type { Contract } from '$lib/platform/database/schema';
import { addUtcDays, toUtcDay, type DateLike } from '$lib/api/date';

/**
 * ATTENTION RANK
 *
 * Which rank a contract is filed under today, the order ranked contracts are read in, and what
 * a rank states about the contracts it holds.
 *
 * A rank is decided from the contract's own fields — its status, its end date, and what it owes
 * today — and from nothing about whoever is asking, which is what makes it the contract's rather
 * than a surface's (ADR 0031). Nothing here touches the database: a router fetches contracts and
 * their materialized aggregates and calls in.
 */

export const DEFAULT_ENDING_SOON_NOTICE_DAYS = 60;

/**
 * The statuses no rank admits: termination locks the contract, so the debt on one is a closed
 * matter rather than work.
 */
const UNRANKED_STATUSES: readonly Contract['status'][] = ['terminated'];

/**
 * The statuses a contract can be up for renewal in. A contract that has not started cannot be
 * ending, and one already behind it is not renewed but replaced.
 */
const RENEWABLE_STATUSES: readonly Contract['status'][] = ['active', 'fulfilled'];

/** The notice window as the ranking reads it: whole days, never negative. */
function normalizeNoticeWindowDays(noticeWindowDays: number) {
	return Math.max(Math.floor(noticeWindowDays), 0);
}

/**
 * The ranks, in the order they are read: what is already late, then what is behind, then what
 * needs renewing. Position in this array is the order — nothing else fixes it.
 */
export const CONTRACT_RANKS = ['overdue', 'owing', 'ending-soon'] as const;

/** One of the three ranks a contract needing action is filed under. */
export type ContractRank = (typeof CONTRACT_RANKS)[number];

/** What ordering one ranked contract against another needs of it. */
export type ContractRankOrder = {
	rank: ContractRank;
	outstandingAmount: number;
	contractEnd: number;
	tenantName: string;
};

/** What summarizing a rank needs of the contracts in it. */
export type ContractRankMembership = Pick<ContractRankOrder, 'rank' | 'outstandingAmount'>;

/** A rank stated: which one, how many contracts are under it, and what they owe. */
export type ContractRankSummary = {
	rank: ContractRank;
	contractCount: number;
	totalAmount: number;
};

/**
 * Whether a rank holds contracts that owe money.
 *
 * The split every reader of a rank turns on: a money rank's contracts are ranked because of a
 * debt, so they carry an amount, while a renewals contract owes nothing by construction. Named
 * here rather than in a component because it is the same division {@link getContractRank} makes
 * when it files a contract — how each side is then *presented* is the surface's.
 */
export function isMoneyRank(rank: ContractRank) {
	return rank !== 'ending-soon';
}

export function isContractEndingSoon(
	status: Contract['status'],
	contractEnd: DateLike,
	now: DateLike,
	noticeWindowDays: number = DEFAULT_ENDING_SOON_NOTICE_DAYS
) {
	if (!RENEWABLE_STATUSES.includes(status)) {
		return false;
	}

	const today = toUtcDay(now);
	const end = toUtcDay(contractEnd);
	const normalizedNoticeWindowDays = normalizeNoticeWindowDays(noticeWindowDays);

	return (
		end.getTime() >= today.getTime() &&
		end.getTime() <= addUtcDays(today, normalizedNoticeWindowDays).getTime()
	);
}

/**
 * The rank a contract is filed under today, or `undefined` when it needs nothing.
 *
 * Money ranks a contract on what it **owes today** — everything expected by now minus everything
 * ever paid — never on whether a cycle boundary happened to fall inside the current calendar
 * month. A quarterly contract two months into its quarter has nothing due this month and can
 * still be two full cycles behind.
 *
 * A terminated contract has no rank whatever it owes: termination locks the contract, so the debt
 * on one is a closed matter rather than work. A contract that owes money and ends inside the
 * notice window is ranked on the money, which is what keeps one contract to one rank —
 * {@link isContractEndingSoon} is what marks the second need on it.
 */
export function getContractRank(
	status: Contract['status'],
	contractEnd: DateLike,
	outstandingAmount: number,
	now: DateLike,
	noticeWindowDays: number = DEFAULT_ENDING_SOON_NOTICE_DAYS
): ContractRank | undefined {
	if (UNRANKED_STATUSES.includes(status)) {
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
 * Which statuses a rank admits, stated as the set it holds or the set it excludes.
 *
 * Two shapes rather than one because the two answers are not the same claim. The renewals rank
 * holds a fixed pair and nothing else can join it; the money ranks exclude one status and admit
 * whatever else the status model grows. Flattening either into a list of names would make a
 * status added tomorrow silently drop out of a rank it belongs to.
 */
export type ContractRankStatusBound =
	{ holds: readonly Contract['status'][] } | { excludes: readonly Contract['status'][] };

/**
 * What every contract in a rank is true of, in stored fields alone.
 *
 * These are **necessary conditions, not the rank**: a contract can satisfy all of them and still
 * be in no rank. That is the point — a reader that cannot compute the rank in its own terms can
 * still narrow to a superset of it and let {@link getContractRank} decide what is left.
 */
export type ContractRankBounds = {
	status: ContractRankStatusBound;
	/**
	 * Whether every contract in the rank has paid less than its whole expected amount.
	 *
	 * Sound because the two aggregates bound each other: what a contract is expected to have
	 * paid *by today* can never exceed what it is expected to pay in total, so owing anything
	 * today means the total is not yet settled. The converse does not hold, and is not claimed —
	 * a contract halfway through its term owes nothing today and has paid a fraction of the
	 * total.
	 */
	requiresUnpaidBalance: boolean;
	/** The earliest end date the rank admits, inclusive. Open where absent. */
	endFrom?: Date;
	/** The first end date past the rank's window, exclusive. Open where absent. */
	endBefore?: Date;
};

/**
 * The bounds a rank puts on a contract's stored fields, for a reader that narrows before it
 * ranks.
 *
 * A rank is decided from what a contract owes *today*, which no column holds, so a query cannot
 * ask for a rank directly. It can ask for these — and what they leave out is small: a contract
 * that is not terminated, still owes against its total, and ends before today is very nearly the
 * overdue rank already.
 *
 * **Read the window from the same instant the ranking will use.** A caller that takes `now`
 * twice can straddle a UTC day boundary between narrowing and ranking, and then a contract that
 * changed rank in between is read under one day and judged under the next.
 */
export function getContractRankBounds(
	rank: ContractRank,
	now: DateLike,
	noticeWindowDays: number = DEFAULT_ENDING_SOON_NOTICE_DAYS
): ContractRankBounds {
	const today = toUtcDay(now);

	if (rank === 'ending-soon') {
		return {
			status: { holds: RENEWABLE_STATUSES },
			// the renewals rank requires the opposite — a contract that owes nothing today — and
			// that has no sound expression in the stored aggregates: a contract can owe nothing
			// today and be far from paid in total. The notice window is what narrows this rank.
			requiresUnpaidBalance: false,
			endFrom: today,
			// exclusive, and the window is inclusive of its last day, so it is the day after
			endBefore: addUtcDays(today, normalizeNoticeWindowDays(noticeWindowDays) + 1)
		};
	}

	return {
		status: { excludes: UNRANKED_STATUSES },
		requiresUnpaidBalance: true,
		// the two money ranks split the same set on where the end date falls, at the same
		// boundary and from the same side, so between them they cover it exactly
		...(rank === 'overdue' ? { endBefore: today } : { endFrom: today })
	};
}

/**
 * Follow-up order: the ranks in their own order, then the largest debt first inside a money rank
 * and the soonest end first inside the renewals, tenant name breaking either tie so a page of
 * equal values is not in insertion order.
 *
 * The order is part of what a rank means rather than a presentation choice, so a second reader of
 * the rank gets it without restating it.
 */
export function compareContractsByRank(left: ContractRankOrder, right: ContractRankOrder) {
	const rankDifference = CONTRACT_RANKS.indexOf(left.rank) - CONTRACT_RANKS.indexOf(right.rank);

	if (rankDifference !== 0) {
		return rankDifference;
	}

	if (left.rank === 'ending-soon') {
		return left.contractEnd - right.contractEnd || left.tenantName.localeCompare(right.tenantName);
	}

	return (
		right.outstandingAmount - left.outstandingAmount ||
		left.contractEnd - right.contractEnd ||
		left.tenantName.localeCompare(right.tenantName)
	);
}

/**
 * One summary per rank that holds something, in the ranks' own order.
 *
 * A rank nothing landed in is left out rather than summarized as zero: a heading is derived from
 * the records under it, so an empty rank has no heading for a count to appear on.
 *
 * **What admits a rank is its contract count, never its money total.** A renewals contract owes
 * nothing by definition, so that rank's total is always zero — dropping a rank on a zero total
 * would empty the renewals rank of every contract in it.
 */
export function summarizeContractRanks(
	entries: readonly ContractRankMembership[]
): ContractRankSummary[] {
	return CONTRACT_RANKS.map((rank) => {
		const members = entries.filter((entry) => entry.rank === rank);

		return {
			rank,
			contractCount: members.length,
			totalAmount: members.reduce((sum, member) => sum + member.outstandingAmount, 0)
		};
	}).filter((summary) => summary.contractCount > 0);
}
