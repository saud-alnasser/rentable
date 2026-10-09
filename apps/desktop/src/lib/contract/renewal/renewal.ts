import type { Contract } from '$lib/platform/database/schema';
import { addUtcDays, toUtcDay, type DateLike } from '$lib/date';
import { refuse } from '$lib/api/refusal';
import {
	getContractCycleCountForPeriod,
	getContractEndDateForCycles
} from '$lib/contract/schedule/cycle';

/**
 * RENEWAL
 *
 * Continuing a contract past its own end: the term a renewal proposes, the rule that separates a
 * renewal from an edit, and the rule that a contract is renewed once.
 *
 * **A renewal produces a successor; it never moves the predecessor's end date.** A contract's
 * expected amount and its whole derived status model are computed from its period, so widening
 * a period that already has payments against it rewrites the term actually served rather than
 * continuing it. The successor is an ordinary contract, created through the ordinary rules, and
 * the predecessor is left exactly as it was.
 *
 * **The successor records what it renews** in `renews_contract_id` (effort 861, requirement 5),
 * and that link is the whole of the lineage: whether a contract is renewed is read from it, never
 * stored (`renewedColumn` in `contract/row.ts`). So a contract a standing successor already renews
 * is not renewed a second time. The successor may carry a different rent from its predecessor
 * (requirement 8), since a renewal at a new rent is the common case; its tenant, units and
 * interval are still the predecessor's.
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
		throw refuse('contract.renewalBeforeEnd');
	}
}

/**
 * The rule that a contract is renewed once: one a standing successor already renews is refused
 * another, which would leave two contracts each claiming to continue it. A successor that was
 * terminated, retired or deleted no longer stands, so the contract may be renewed again.
 */
export function ensureNotRenewed(renewed: boolean) {
	if (renewed) {
		throw refuse('contract.alreadyRenewed');
	}
}
