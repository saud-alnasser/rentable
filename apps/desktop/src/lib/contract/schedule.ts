import type { Payment } from '$lib/platform/database/schema';
import { toUtcDay, type DateLike } from '$lib/api/date';
import type { PaymentLike } from '$lib/payment/payment';
import {
	EPSILON,
	countExpectedPayments,
	getContractCycleCountForPeriod,
	getContractCycleStartDate,
	hasSatisfiedContractPaymentRequirement,
	type ContractLike
} from '$lib/contract/contract';

/**
 * SCHEDULE
 *
 * A contract's period laid out as its cycles, and its payments allocated to them oldest first.
 * The schedule, the receipt, the due-soon rank and the reminder all read this; none of them
 * allocates for itself. It is computed on read and never stored: nothing here reaches the
 * database, and a router fetches the contract and its payments and calls in.
 */

/**
 * What a cycle is, today.
 *
 * - `paid`: covered in full;
 * - `late`: due before today and not covered in full, whatever part is covered;
 * - `due`: due today and not covered in full;
 * - `partly-paid`: due after today, with part of it covered;
 * - `upcoming`: due after today, with nothing covering it.
 */
export type ScheduleCycleState = 'paid' | 'late' | 'due' | 'partly-paid' | 'upcoming';

export type ScheduleCycle = {
	/** the cycle's position in the period, counted from zero. */
	index: number;
	/** the UTC day the cycle falls due: the start date, then the first day of each interval. */
	due: Date;
	/** what the cycle costs, which is the contract's cost. */
	amount: number;
	/** how much of the amount the payments cover. */
	covered: number;
	state: ScheduleCycleState;
};

/** a payment as the allocation takes it: what it is worth, when, and which one it is. */
export type SchedulePaymentLike = PaymentLike & Pick<Payment, 'id'>;

export type ContractSchedule = {
	cycles: ScheduleCycle[];
	/** for every payment, by id, the indexes of the cycles it covers, in order. */
	coverage: Map<string, number[]>;
};

/**
 * The order payments are allocated in: by UTC day, then by the order they were recorded.
 *
 * Ids are UUIDv7, whose timestamp and counter make id order recording order
 * (`platform/database/identity.ts`), so two payments on one day are taken as they were entered.
 */
function compareByAllocationOrder(a: SchedulePaymentLike, b: SchedulePaymentLike) {
	const byDay = toUtcDay(a.date).getTime() - toUtcDay(b.date).getTime();

	if (byDay !== 0) {
		return byDay;
	}

	return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function getCycleCount(contract: ContractLike) {
	return getContractCycleCountForPeriod(contract) ?? countExpectedPayments(contract, contract.end);
}

/**
 * A cycle's state, from what covers it and where its due date falls against today.
 *
 * A terminated contract reads no cycle as `late` or `due`: termination makes the debt a closed
 * matter (the contract context, *Owing*), so a cycle it left uncovered is read by its cover
 * alone, `partly-paid` where part of it is covered and `upcoming` where none is.
 */
function getCycleState(
	cycle: Pick<ScheduleCycle, 'due' | 'amount' | 'covered'>,
	today: Date,
	isTerminated: boolean
): ScheduleCycleState {
	if (hasSatisfiedContractPaymentRequirement(cycle.covered, cycle.amount)) {
		return 'paid';
	}

	if (!isTerminated) {
		if (cycle.due.getTime() < today.getTime()) {
			return 'late';
		}

		if (cycle.due.getTime() === today.getTime()) {
			return 'due';
		}
	}

	return cycle.covered > 0 ? 'partly-paid' : 'upcoming';
}

/**
 * Lays a contract out as its cycles and allocates its payments to them oldest first.
 *
 * Every payment, taken in allocation order, fills the earliest cycle not yet covered before the
 * next; a payment larger than what that cycle lacks carries on into the following ones, and
 * whatever is left once every cycle is covered covers nothing. A cycle within `EPSILON` of its
 * amount is covered, exactly as the contract is paid in full within it.
 *
 * The due dates are the ones `countExpectedPayments` counts, so a cycle is due on the day that
 * function first counts it. Oldest first, the payments cover the earliest cycles, and so on any
 * contract that is not terminated the part of the `late` and `due` cycles left uncovered is the
 * outstanding amount `getOutstandingExpectedAmount` states, to the domain's tolerance.
 */
export function scheduleContract(
	contract: ContractLike,
	payments: SchedulePaymentLike[],
	now: DateLike
): ContractSchedule {
	const today = toUtcDay(now);
	const isTerminated = contract.status === 'terminated';
	const cycleCount = getCycleCount(contract);

	const cycles = Array.from({ length: cycleCount }, (_, index) => ({
		index,
		due: getContractCycleStartDate(contract.start, contract.interval, index),
		amount: contract.cost,
		covered: 0
	}));

	const coverage = new Map<string, number[]>();
	let cycleIndex = 0;

	for (const payment of [...payments].sort(compareByAllocationOrder)) {
		const covers: number[] = [];
		let remaining = payment.amount;

		while (remaining > EPSILON && cycleIndex < cycles.length) {
			const cycle = cycles[cycleIndex];
			const taken = Math.min(remaining, cycle.amount - cycle.covered);

			cycle.covered += taken;
			remaining -= taken;
			covers.push(cycleIndex);

			if (hasSatisfiedContractPaymentRequirement(cycle.covered, cycle.amount)) {
				cycleIndex += 1;
			}
		}

		coverage.set(payment.id, covers);
	}

	return {
		cycles: cycles.map((cycle) => ({
			...cycle,
			state: getCycleState(cycle, today, isTerminated)
		})),
		coverage
	};
}
