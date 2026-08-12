import type { ContractRank } from '$lib/contract/rank';
import type { Contract } from '$lib/platform/database/schema';

/**
 * DASHBOARD
 *
 * What the landing screen shows, as opposed to what is true of a contract. Which rank a contract
 * is filed under, the order ranked contracts are read in, and what a rank states are the
 * contract's own and live in `$lib/contract/rank` (ADR 0031); what is left here is the screen's.
 */

/**
 * How many contracts of a rank the screen shows before it offers a way through to the rest.
 *
 * The one place the number is stated: the read is bounded by it and the screen renders what the
 * read returns, so the two cannot disagree about how many rows a rank has.
 */
export const DASHBOARD_ENTRIES_PER_RANK = 4;

/**
 * Whether a contract counts toward the screen's portfolio figures.
 *
 * A terminated contract is excluded: the figures describe the month's live work, and a locked
 * contract's money is a closed matter. This is the screen's rule about its own figures rather
 * than a fact about the contract, which is why it did not travel with the rank.
 */
export function isContractIncludedInDashboardPortfolio(status: Contract['status']) {
	return status !== 'terminated';
}

/**
 * The first {@link DASHBOARD_ENTRIES_PER_RANK} contracts of each rank, in the order given.
 *
 * What crosses the IPC boundary is bounded by what the screen paints rather than by how much
 * work the portfolio is carrying, so a queue of four hundred contracts costs the same to read
 * as a queue of twelve. The entries must already be in the ranks' own order — this drops the
 * tail of each rank and decides nothing about which contracts are in it.
 *
 * The counts and totals a rank states are summarized before this runs, so they keep describing
 * every contract under the rank rather than the few that survive it.
 */
export function takeEntriesShownPerRank<TEntry extends { rank: ContractRank }>(
	entries: readonly TEntry[]
): TEntry[] {
	const takenPerRank = new Map<ContractRank, number>();

	return entries.filter((entry) => {
		const taken = takenPerRank.get(entry.rank) ?? 0;

		if (taken >= DASHBOARD_ENTRIES_PER_RANK) {
			return false;
		}

		takenPerRank.set(entry.rank, taken + 1);

		return true;
	});
}
