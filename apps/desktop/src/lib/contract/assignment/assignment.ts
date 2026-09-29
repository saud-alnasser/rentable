import type { Contract, Unit } from '$lib/platform/database/schema';
import { toUtcDay, type DateLike } from '$lib/date';
import { refuse } from '$lib/api/refusal';
import {
	CONTRACT_OCCUPYING_STATUSES,
	deriveContractStatus,
	type ContractLike,
	type PaymentLike
} from '$lib/contract/contract';

/**
 * ASSIGNMENT
 *
 * The link between a contract and the units it holds: whether two terms compete for a unit, the
 * rules a router asserts before a unit is held over a term, the status a unit derives from the
 * contracts holding it, and what a contract holds once one unit is moved between the panes of its
 * units tab.
 *
 * A unit may be held by at most one contract that is not terminated over any given day, and
 * whether it is occupied is a question about those contracts, so both are answered here rather
 * than by the unit.
 */

type ContractRangeLike = Pick<ContractLike, 'start' | 'end'>;

type UnitAssignmentLike = {
	unitId: string;
	contractId: string;
	status: Contract['status'];
	start: DateLike;
	end: DateLike;
};

/** an assignment row joined with its contract, as routers select it. */
export type ContractAssignment = UnitAssignmentLike & {
	interval: Contract['interval'];
	cost: Contract['cost'];
};

export function rangesOverlap(startA: DateLike, endA: DateLike, startB: DateLike, endB: DateLike) {
	const normalizedStartA = toUtcDay(startA).getTime();
	const normalizedEndA = toUtcDay(endA).getTime();
	const normalizedStartB = toUtcDay(startB).getTime();
	const normalizedEndB = toUtcDay(endB).getTime();

	return normalizedStartA <= normalizedEndB && normalizedStartB <= normalizedEndA;
}

export function hasSameUtcDateRange(
	startA: DateLike,
	endA: DateLike,
	startB: DateLike,
	endB: DateLike
) {
	return (
		toUtcDay(startA).getTime() === toUtcDay(startB).getTime() &&
		toUtcDay(endA).getTime() === toUtcDay(endB).getTime()
	);
}

export function getConflictingAssignedUnitIds(
	assignments: UnitAssignmentLike[],
	contract: ContractRangeLike,
	currentContractId: string
) {
	return new Set(
		assignments
			.filter(
				(assignment) =>
					assignment.contractId !== currentContractId &&
					assignment.status !== 'terminated' &&
					rangesOverlap(assignment.start, assignment.end, contract.start, contract.end)
			)
			.map((assignment) => assignment.unitId)
	);
}

export function deriveUnitStatus(
	assignments: Array<{ contract: ContractLike; payments: PaymentLike[] }>,
	now: DateLike
): Unit['status'] {
	const today = toUtcDay(now).getTime();

	const isOccupied = assignments.some(({ contract, payments }) => {
		const start = toUtcDay(contract.start).getTime();
		const end = toUtcDay(contract.end).getTime();

		if (today < start || today > end) {
			return false;
		}

		const status = deriveContractStatus(contract, payments, now);

		return (CONTRACT_OCCUPYING_STATUSES as readonly Contract['status'][]).includes(status);
	});

	return isOccupied ? 'occupied' : 'vacant';
}

/** derives the status of each unit from its assignments and their payments. */
export function deriveUnitStatuses(
	unitIds: string[],
	assignments: ContractAssignment[],
	paymentsByContractId: Map<string, PaymentLike[]>,
	now: DateLike
) {
	const assignmentsByUnitId = new Map<
		string,
		Array<{ contract: ContractLike; payments: PaymentLike[] }>
	>();

	for (const assignment of assignments) {
		assignmentsByUnitId.set(assignment.unitId, [
			...(assignmentsByUnitId.get(assignment.unitId) ?? []),
			{
				contract: {
					status: assignment.status,
					start: assignment.start,
					end: assignment.end,
					interval: assignment.interval,
					cost: assignment.cost
				},
				payments: paymentsByContractId.get(assignment.contractId) ?? []
			}
		]);
	}

	return new Map(
		unitIds.map((unitId) => [unitId, deriveUnitStatus(assignmentsByUnitId.get(unitId) ?? [], now)])
	);
}

export function ensurePeriodDoesNotOverlapAssignments(
	assignments: UnitAssignmentLike[],
	range: ContractRangeLike,
	contractId: string
) {
	if (getConflictingAssignedUnitIds(assignments, range, contractId).size > 0) {
		throw refuse('contract.periodOverlapsUnits');
	}
}

/**
 * Refuses where another contract holds one of these units over this contract's term.
 *
 * The refusal names what the reader would change. Where the units are the ones they chose, as a
 * new contract's are, it is `contract.unitsTaken` and belongs under the units; where the units
 * come with the contract and only the term was theirs, as a renewal's do, it is the default and
 * belongs under the term.
 */
export function ensureUnitsAssignable(
	assignments: UnitAssignmentLike[],
	contract: ContractRangeLike,
	contractId: string,
	code: 'contract.unitsUnavailable' | 'contract.unitsTaken' = 'contract.unitsUnavailable'
) {
	if (getConflictingAssignedUnitIds(assignments, contract, contractId).size > 0) {
		throw refuse(code);
	}
}

// --- Moving one unit ------------------------------------------------------------------
//
// A move between the panes commits on its own as a whole-set write (ADR 0029), so the set is
// derived from what the record holds rather than accumulated on screen: there is no unsaved state
// for it to be computed from.

/**
 * The units a contract holds after one is moved.
 *
 * @param heldUnitIds what the contract holds now — unfiltered, whatever the panes are showing.
 * @param unitId the unit whose row was pressed.
 * @param wasHeld the side it was pressed on: held units leave the set, offered ones join it.
 */
export function toTransferredUnitIds(
	heldUnitIds: readonly string[],
	unitId: string,
	wasHeld: boolean
): string[] {
	const remaining = heldUnitIds.filter((id) => id !== unitId);

	return wasHeld ? remaining : [...remaining, unitId];
}
