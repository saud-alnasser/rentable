import type { Contract } from '$lib/platform/database/schema';

/**
 * DASHBOARD
 *
 * What the landing screen shows, as opposed to what is true of a contract. Which rank a contract
 * is filed under, the order ranked contracts are read in, and what a rank states are the
 * contract's own and live in `$lib/contract/rank` (ADR 0031); what is left here is the screen's.
 */

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
