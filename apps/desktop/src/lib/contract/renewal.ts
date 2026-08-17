import type { Contract } from '$lib/platform/database/schema';
import { addUtcDays, toUtcDay, type DateLike } from '$lib/api/date';
import {
	badRequest,
	getContractCycleCountForPeriod,
	getContractEndDateForCycles
} from '$lib/contract/contract';

/**
 * RENEWAL
 *
 * Continuing a contract past its own end: the term a renewal proposes, and the rule that
 * separates a renewal from an edit.
 *
 * **A renewal produces a successor; it never moves the predecessor's end date.** A contract's
 * expected amount and its whole derived status model are computed from its period, so widening
 * a period that already has payments against it rewrites the term actually served rather than
 * continuing it. The successor is an ordinary contract, created through the ordinary rules, and
 * the predecessor is left exactly as it was.
 *
 * Nothing here records lineage — the successor stores no link back to what it renews. That is a
 * schema change, and the action is useful without one.
 */

/** The fields a renewal reads off the contract being renewed. */
type ContractTermLike = {
	start: DateLike;
	end: DateLike;
	interval: Contract['interval'];
};

/** A successor's term: where it starts, where it ends, and how many cycles that is. */
export type ContractRenewalTerm = {
	start: Date;
	end: Date;
	cycles: number;
};

/**
 * The term a renewal proposes: the day after the predecessor's last, over the same number of
 * cycles at the same interval.
 *
 * The day after, rather than the same day: a period includes both its ends, so a successor
 * starting on the predecessor's end date would be a day the tenant is charged for twice — and
 * the two contracts would hold the same units on it, which the overlap rule refuses anyway.
 *
 * The end is the one the interval calculates rather than the predecessor's own, which may sit
 * anywhere inside the end-date tolerance. A proposal is where the user starts, and starting them
 * on the exact cycle boundary is the offer they are most likely to keep; the term is theirs to
 * move before the successor is created.
 *
 * A predecessor whose period matches no whole number of cycles renews as a single cycle. It
 * cannot arise through the router — the period rule refuses it on the way in — but a period that
 * drifted out of tolerance under a later reading of the calendar still has to propose something.
 */
export function getContractRenewalTerm(contract: ContractTermLike): ContractRenewalTerm {
	const start = addUtcDays(toUtcDay(contract.end), 1);
	const cycles = getContractCycleCountForPeriod(contract) ?? 1;

	return {
		start,
		end: getContractEndDateForCycles(start, contract.interval, cycles) ?? start,
		cycles
	};
}

/**
 * Whether a proposed term continues the contract it renews rather than overlapping it.
 *
 * Whole days in UTC, like every other date comparison in this domain, so a renewal does not
 * become valid or invalid depending on the machine's timezone.
 */
export function doesRenewalFollowPredecessor(predecessorEnd: DateLike, successorStart: DateLike) {
	return toUtcDay(successorStart).getTime() > toUtcDay(predecessorEnd).getTime();
}

/**
 * The rule the router asserts before persisting a successor.
 *
 * It is stated separately from the overlap check rather than left to it: a renewal of a contract
 * holding no units would otherwise pass a term that runs alongside the one it claims to continue,
 * and the reader would be told nothing was wrong.
 */
export function ensureRenewalFollowsPredecessor(
	predecessorEnd: DateLike,
	successorStart: DateLike
) {
	if (!doesRenewalFollowPredecessor(predecessorEnd, successorStart)) {
		badRequest('a renewal must start after the contract it renews ends');
	}
}
