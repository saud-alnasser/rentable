import type { Contract } from '$lib/platform/database/schema';
import { addUtcDays, addUtcMonths, toUtcDay, type DateLike } from '$lib/date';
import type { ContractLike } from '$lib/contract/contract';

/**
 * CYCLE
 *
 * a contract's period counted in cycles: how long an interval is, the day each cycle starts, the
 * end date a number of cycles lands on and the tolerance an end date may sit within, how many
 * cycles have fallen due by a day, and what those cycles are worth. The schedule lays these cycles
 * out one by one; the contract's own rules and statuses read their counts and amounts from here.
 */

const UTC_DAY_MS = 24 * 60 * 60 * 1000;

export const CONTRACT_END_DATE_TOLERANCE_DAYS = 5;

const INTERVAL_MONTHS: Record<Contract['interval'], number> = {
	'1m': 1,
	'3m': 3,
	'6m': 6,
	'12m': 12
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

export function hasValidContractPeriodForInterval(
	contract: Pick<ContractLike, 'start' | 'end' | 'interval'>
) {
	return getContractCycleCountForPeriod(contract) !== undefined;
}
