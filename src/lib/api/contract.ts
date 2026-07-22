import type { Contract, Payment, Unit } from '$lib/api/database/schema';
import { addUtcDays, addUtcMonths, toUtcDay, type DateLike } from '$lib/api/date';
import { TRPCError } from '@trpc/server';

/**
 * CONTRACT
 *
 * the contract domain module: status derivation, period and cost invariants, cycle and
 * expected-amount arithmetic, and the rules routers assert before persisting. Routers
 * fetch rows and call in; no rule or derivation lives anywhere else.
 */

type ContractLike = Omit<
	Pick<Contract, 'status' | 'start' | 'end' | 'interval' | 'cost'>,
	'start' | 'end'
> & {
	start: DateLike;
	end: DateLike;
};

type PaymentLike = Omit<Pick<Payment, 'amount' | 'date'>, 'date'> & {
	date: DateLike;
};

type ContractRangeLike = Pick<ContractLike, 'start' | 'end'>;

type UnitAssignmentLike = {
	unitId: number;
	contractId: number;
	status: Contract['status'];
	start: DateLike;
	end: DateLike;
};

/** an assignment row joined with its contract, as routers select it. */
export type ContractAssignment = UnitAssignmentLike & {
	interval: Contract['interval'];
	cost: Contract['cost'];
};

const EPSILON = 0.0001;
const UTC_DAY_MS = 24 * 60 * 60 * 1000;

export const CONTRACT_END_DATE_TOLERANCE_DAYS = 5;

const INTERVAL_MONTHS: Record<Contract['interval'], number> = {
	'1m': 1,
	'3m': 3,
	'6m': 6,
	'12m': 12
};

const INTERVAL_LABELS: Record<Contract['interval'], string> = {
	'1m': 'monthly',
	'3m': 'quarterly',
	'6m': 'semi-annual',
	'12m': 'annual'
};

export function getIntervalMonths(interval: Contract['interval']) {
	return INTERVAL_MONTHS[interval];
}

export function getContractCycleStartDate(
	start: DateLike,
	interval: Contract['interval'],
	cycleOffset: number
) {
	return addUtcMonths(start, getIntervalMonths(interval) * cycleOffset);
}

export function getContractEndDateForCycles(
	start: DateLike,
	interval: Contract['interval'],
	cycleCount: number
) {
	if (!Number.isInteger(cycleCount) || cycleCount <= 0) {
		return undefined;
	}

	return addUtcDays(getContractCycleStartDate(start, interval, cycleCount), -1);
}

export function getContractEndDateWindow(
	start: DateLike,
	interval: Contract['interval'],
	cycleCount: number,
	toleranceDays = CONTRACT_END_DATE_TOLERANCE_DAYS
) {
	const calculatedEnd = getContractEndDateForCycles(start, interval, cycleCount);

	if (!calculatedEnd) {
		return undefined;
	}

	return {
		start: addUtcDays(calculatedEnd, -toleranceDays),
		end: addUtcDays(calculatedEnd, toleranceDays),
		calculatedEnd
	};
}

export function getContractCycleCountForPeriod(
	contract: Pick<ContractLike, 'start' | 'end' | 'interval'>,
	toleranceDays = CONTRACT_END_DATE_TOLERANCE_DAYS
) {
	const start = toUtcDay(contract.start);
	const end = toUtcDay(contract.end);

	if (end.getTime() < start.getTime()) {
		return undefined;
	}

	const maxExpectedEnd = end.getTime() + toleranceDays * UTC_DAY_MS;

	for (let cycleCount = 1; ; cycleCount += 1) {
		const calculatedEnd = getContractEndDateForCycles(start, contract.interval, cycleCount);

		if (!calculatedEnd) {
			return undefined;
		}

		const differenceInDays = (end.getTime() - calculatedEnd.getTime()) / UTC_DAY_MS;

		if (Math.abs(differenceInDays) <= toleranceDays) {
			return cycleCount;
		}

		if (calculatedEnd.getTime() > maxExpectedEnd) {
			return undefined;
		}
	}
}

export function countExpectedPayments(contract: ContractLike, now: DateLike) {
	const start = toUtcDay(contract.start);
	const end = toUtcDay(contract.end);
	const today = toUtcDay(now);
	const totalCycleCount = getContractCycleCountForPeriod(contract);

	if (today.getTime() < start.getTime()) {
		return 0;
	}

	const dueUntil = today.getTime() < end.getTime() ? today : end;
	const maxExpectedPayments = totalCycleCount ?? Number.MAX_SAFE_INTEGER;

	let expectedPayments = 1;
	let nextDueDate = getContractCycleStartDate(start, contract.interval, 1);

	while (expectedPayments < maxExpectedPayments && nextDueDate.getTime() <= dueUntil.getTime()) {
		expectedPayments += 1;
		nextDueDate = getContractCycleStartDate(start, contract.interval, expectedPayments);
	}

	return expectedPayments;
}

export function countExpectedPaymentsInRange(
	contract: ContractLike,
	rangeStart: DateLike,
	rangeEnd: DateLike
) {
	const normalizedStart = toUtcDay(rangeStart);
	const normalizedEnd = toUtcDay(rangeEnd);

	if (normalizedEnd.getTime() < normalizedStart.getTime()) {
		return 0;
	}

	const beforeRangeStart = addUtcDays(normalizedStart, -1);

	return Math.max(
		countExpectedPayments(contract, normalizedEnd) -
			countExpectedPayments(contract, beforeRangeStart),
		0
	);
}

export function getExpectedAmountBy(contract: ContractLike, now: DateLike) {
	return countExpectedPayments(contract, now) * contract.cost;
}

export function getExpectedAmountInRange(
	contract: ContractLike,
	rangeStart: DateLike,
	rangeEnd: DateLike
) {
	return countExpectedPaymentsInRange(contract, rangeStart, rangeEnd) * contract.cost;
}

export function getContractTotalCost(contract: ContractLike) {
	const cycleCount = getContractCycleCountForPeriod(contract);

	return (cycleCount ?? countExpectedPayments(contract, contract.end)) * contract.cost;
}

export function getPaidAmount(payments: PaymentLike[]) {
	return payments.reduce((sum, payment) => sum + payment.amount, 0);
}

export function getContractPaymentSummary(contract: ContractLike, payments: PaymentLike[]) {
	return {
		paidAmount: getPaidAmount(payments),
		expectedAmount: getContractTotalCost(contract)
	};
}

export function hasSatisfiedContractPaymentRequirement(paidAmount: number, expectedAmount: number) {
	return paidAmount + EPSILON >= expectedAmount;
}

export function isContractPaidInFull(contract: ContractLike, payments: PaymentLike[]) {
	const { paidAmount, expectedAmount } = getContractPaymentSummary(contract, payments);

	return hasSatisfiedContractPaymentRequirement(paidAmount, expectedAmount);
}

export function getOutstandingExpectedAmount(
	contract: ContractLike,
	payments: PaymentLike[],
	now: DateLike
) {
	return Math.max(getExpectedAmountBy(contract, now) - getPaidAmount(payments), 0);
}

export function hasValidContractPeriodForInterval(
	contract: Pick<ContractLike, 'start' | 'end' | 'interval'>
) {
	return getContractCycleCountForPeriod(contract) !== undefined;
}

export function deriveContractStatus(
	contract: ContractLike,
	payments: PaymentLike[],
	now: DateLike
) {
	if (contract.status === 'terminated') {
		return 'terminated' satisfies Contract['status'];
	}

	const today = toUtcDay(now);
	const start = toUtcDay(contract.start);
	const end = toUtcDay(contract.end);
	const isPaidInFull = isContractPaidInFull(contract, payments);

	if (today.getTime() > end.getTime()) {
		if (!isPaidInFull) {
			return 'defaulted' satisfies Contract['status'];
		}

		return 'expired' satisfies Contract['status'];
	}

	if (today.getTime() < start.getTime()) {
		return 'scheduled' satisfies Contract['status'];
	}

	if (isPaidInFull) {
		return 'fulfilled' satisfies Contract['status'];
	}

	return 'active' satisfies Contract['status'];
}

export function canManuallyTerminateContractStatus(status: Contract['status']) {
	return (
		status === 'active' || status === 'fulfilled' || status === 'expired' || status === 'defaulted'
	);
}

export function canUnterminateContractStatus(status: Contract['status']) {
	return status === 'terminated';
}

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
	currentContractId: number
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

		return status === 'active' || status === 'fulfilled' || status === 'defaulted';
	});

	return isOccupied ? 'occupied' : 'vacant';
}

/** groups payment rows by their contract, preserving row order within each group. */
export function groupPaymentsByContractId<P extends { contractId: number }>(payments: P[]) {
	const paymentsByContractId = new Map<number, P[]>();

	for (const payment of payments) {
		paymentsByContractId.set(payment.contractId, [
			...(paymentsByContractId.get(payment.contractId) ?? []),
			payment
		]);
	}

	return paymentsByContractId;
}

/** derives the status of each unit from its assignments and their payments. */
export function deriveUnitStatuses(
	unitIds: number[],
	assignments: ContractAssignment[],
	paymentsByContractId: Map<number, PaymentLike[]>,
	now: DateLike
) {
	const assignmentsByUnitId = new Map<
		number,
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

// --- Rules asserted before persisting -------------------------------------------------
//
// Each throws the user-facing BAD_REQUEST the routers previously raised inline. Routers
// fetch the rows a rule needs and call in; the condition and its message live here.

function badRequest(message: string): never {
	throw new TRPCError({ code: 'BAD_REQUEST', message });
}

export function ensureValidContractInput(
	input: Pick<Contract, 'start' | 'end' | 'interval' | 'cost'>
) {
	if (input.end < input.start) {
		badRequest('end date must be after start date');
	}

	if (!hasValidContractPeriodForInterval(input)) {
		badRequest(
			`contract period must stay within ${CONTRACT_END_DATE_TOLERANCE_DAYS} days of the calculated ${INTERVAL_LABELS[input.interval]} cycle end date`
		);
	}

	if (input.cost <= 0) {
		badRequest('cost per payment must be greater than zero');
	}
}

/** the router passes whatever row its uniqueness query found; any row is a conflict. */
export function ensureGovIdAvailable(conflicting: unknown) {
	if (conflicting) {
		badRequest('government id is associated with another contract');
	}
}

export function ensureContractIsNotTerminated(status: Contract['status']) {
	if (status === 'terminated') {
		badRequest('terminated contracts are locked');
	}
}

export function ensureContractTerminable(status: Contract['status']) {
	if (!canManuallyTerminateContractStatus(status)) {
		badRequest('only active, fulfilled, or past contracts can be terminated');
	}
}

export function ensureContractUnterminable(status: Contract['status']) {
	if (!canUnterminateContractStatus(status)) {
		badRequest('only terminated contracts can be unterminated');
	}
}

export function ensureContractUnitsAreMutable(payments: unknown[]) {
	if (payments.length > 0) {
		badRequest('cannot change contract units after payments have been registered');
	}
}

export function ensureContractPaymentsCreatable(contract: ContractLike, payments: PaymentLike[]) {
	if (isContractPaidInFull(contract, payments)) {
		badRequest('cannot add payments once the required contract amount has been fully paid');
	}
}

export function ensureValidPaymentAmount(amount: number) {
	if (amount <= 0) {
		badRequest('payment amount must be greater than zero');
	}
}

export function ensureContractDeletable(units: unknown[], payments: unknown[]) {
	if (units.length > 0) {
		badRequest('cannot delete contract with associated units');
	}

	if (payments.length > 0) {
		badRequest('cannot delete contract with associated payments');
	}
}

export function ensurePeriodDoesNotOverlapAssignments(
	assignments: UnitAssignmentLike[],
	range: ContractRangeLike,
	contractId: number
) {
	if (getConflictingAssignedUnitIds(assignments, range, contractId).size > 0) {
		badRequest('assigned units overlap with another contract during the selected dates');
	}
}

export function ensureUnitsAssignable(
	assignments: UnitAssignmentLike[],
	contract: ContractRangeLike,
	contractId: number
) {
	if (getConflictingAssignedUnitIds(assignments, contract, contractId).size > 0) {
		badRequest('one or more selected units are already assigned to an overlapping contract');
	}
}
