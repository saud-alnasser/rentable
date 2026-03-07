import type { Contract, Payment, Unit } from '$lib/api/database/schema';

type DateLike = Date | number;

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

const EPSILON = 0.0001;
const CONTRACT_CYCLE_TOLERANCE = 0.01;
const UTC_DAY_MS = 24 * 60 * 60 * 1000;

const INTERVAL_MONTHS: Record<Contract['interval'], number> = {
	'1m': 1,
	'3m': 3,
	'6m': 6,
	'12m': 12
};

const MIN_INTERVAL_DAYS: Record<Contract['interval'], number> = {
	'1m': 28,
	'3m': 84,
	'6m': 168,
	'12m': 336
};

function toUtcDay(value: DateLike) {
	const date = value instanceof Date ? value : new Date(value);

	return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addUtcMonths(value: Date, months: number) {
	return new Date(
		Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + months, value.getUTCDate())
	);
}

function addUtcDays(value: Date, days: number) {
	return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate() + days));
}

function addUtcMonthsClamped(value: Date, months: number) {
	const targetMonthStart = new Date(
		Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + months, 1)
	);
	const targetYear = targetMonthStart.getUTCFullYear();
	const targetMonth = targetMonthStart.getUTCMonth();
	const targetMonthLastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();

	return new Date(
		Date.UTC(targetYear, targetMonth, Math.min(value.getUTCDate(), targetMonthLastDay))
	);
}

function getClampedCycleBoundary(start: Date, intervalMonths: number, cycleCount: number) {
	return addUtcMonthsClamped(start, intervalMonths * cycleCount);
}

function getWholeContractCycleCount(contract: Pick<ContractLike, 'start' | 'end' | 'interval'>) {
	const start = toUtcDay(contract.start);
	const endExclusive = addUtcDays(toUtcDay(contract.end), 1);
	const intervalMonths = getIntervalMonths(contract.interval);
	let cycleCount = 1;
	let currentBoundary = getClampedCycleBoundary(start, intervalMonths, cycleCount);

	while (endExclusive.getTime() > currentBoundary.getTime()) {
		cycleCount += 1;
		currentBoundary = getClampedCycleBoundary(start, intervalMonths, cycleCount);
	}

	const previousBoundary = getClampedCycleBoundary(start, intervalMonths, cycleCount - 1);
	const boundarySpan = currentBoundary.getTime() - previousBoundary.getTime();

	if (boundarySpan <= 0) {
		return cycleCount;
	}

	const approximateCycleCount =
		cycleCount - 1 + (endExclusive.getTime() - previousBoundary.getTime()) / boundarySpan;
	const nearestWholeCycleCount = Math.round(approximateCycleCount);

	if (
		nearestWholeCycleCount < 1 ||
		Math.abs(approximateCycleCount - nearestWholeCycleCount) > CONTRACT_CYCLE_TOLERANCE + EPSILON
	) {
		return undefined;
	}

	return nearestWholeCycleCount;
}

export function getIntervalMonths(interval: Contract['interval']) {
	return INTERVAL_MONTHS[interval];
}

export function getMinimumContractPeriodDays(interval: Contract['interval']) {
	return MIN_INTERVAL_DAYS[interval];
}

function getInclusiveUtcDayCount(start: DateLike, end: DateLike) {
	const normalizedStart = toUtcDay(start).getTime();
	const normalizedEnd = toUtcDay(end).getTime();

	return Math.floor((normalizedEnd - normalizedStart) / UTC_DAY_MS) + 1;
}

export function countExpectedPayments(contract: ContractLike, now: DateLike = Date.now()) {
	const start = toUtcDay(contract.start);
	const end = toUtcDay(contract.end);
	const today = toUtcDay(now);

	if (today.getTime() < start.getTime()) {
		return 0;
	}

	const dueUntil = today.getTime() < end.getTime() ? today : end;
	const intervalMonths = getIntervalMonths(contract.interval);

	let expectedPayments = 1;
	let nextDueDate = addUtcMonths(start, intervalMonths);

	while (nextDueDate.getTime() <= dueUntil.getTime()) {
		expectedPayments += 1;
		nextDueDate = addUtcMonths(nextDueDate, intervalMonths);
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

export function getExpectedAmountBy(contract: ContractLike, now: DateLike = Date.now()) {
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
	const cycleCount = getWholeContractCycleCount(contract);

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
	now: DateLike = Date.now()
) {
	return Math.max(getExpectedAmountBy(contract, now) - getPaidAmount(payments), 0);
}

export function hasValidContractPeriodForInterval(
	contract: Pick<ContractLike, 'start' | 'end' | 'interval'>
) {
	return (
		getInclusiveUtcDayCount(contract.start, contract.end) >=
		getMinimumContractPeriodDays(contract.interval)
	);
}

export function deriveContractStatus(
	contract: ContractLike,
	payments: PaymentLike[],
	now = Date.now()
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
	now = Date.now()
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
