import type { Contract, Unit } from '$lib/platform/database/schema';
import { addUtcDays, addUtcMonths, toUtcDay, type DateLike } from '$lib/api/date';
import { getPaidAmount, type PaymentLike } from '$lib/payment/payment';
import { TRPCError } from '@trpc/server';

/**
 * CONTRACT
 *
 * the contract domain module: status derivation, period and cost invariants, cycle and
 * expected-amount arithmetic, and the rules routers assert before persisting. Routers
 * fetch rows and call in. What a payment is worth on its own is `$lib/payment/payment`;
 * everything that weighs payments against a contract is here.
 */

type ContractLike = Omit<
	Pick<Contract, 'status' | 'start' | 'end' | 'interval' | 'cost'>,
	'start' | 'end'
> & {
	start: DateLike;
	end: DateLike;
};

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

export function getContractPaymentSummary(contract: ContractLike, payments: PaymentLike[]) {
	return {
		paidAmount: getPaidAmount(payments),
		expectedAmount: getContractTotalCost(contract)
	};
}

export function hasSatisfiedContractPaymentRequirement(paidAmount: number, expectedAmount: number) {
	return paidAmount + EPSILON >= expectedAmount;
}

/**
 * What a contract still owes against its whole expected amount, read from the two
 * aggregates reconcile materializes onto it rather than from its payment rows.
 *
 * A contract that has satisfied its requirement owes nothing: an overpayment is not a
 * negative balance, and the float dust the requirement tolerates is not a debt.
 */
export function getRemainingContractBalance(paidAmount: number, expectedAmount: number) {
	if (hasSatisfiedContractPaymentRequirement(paidAmount, expectedAmount)) {
		return 0;
	}

	return expectedAmount - paidAmount;
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

/**
 * The order the statuses rank in when a reader orders the directory by status: what needs
 * the user, then what is running, then what has not started, then the history behind them.
 *
 * It is an ordering over statuses rather than a property of one, so it lives beside the
 * derivation that produces them and is turned into an `ORDER BY` by the router that reads
 * the list. Position in this array is the rank — nothing else fixes it.
 */
export const CONTRACT_ATTENTION_ORDER = [
	'defaulted',
	'active',
	'scheduled',
	'fulfilled',
	'expired',
	'terminated'
] as const satisfies readonly Contract['status'][];

/**
 * The keys the contracts directory may be ordered by, and the whole of what its sort control
 * may offer — an order outside this list is one the query cannot answer, so the router
 * rejects it rather than silently falling back to the directory's own order.
 *
 * It lives here rather than beside the SQL because it decides what a caller is allowed to
 * ask for, and it is exported because the control has to be built from the same list: two
 * places naming the orders is how a control comes to offer one the query cannot serve.
 */
export const CONTRACT_SORT_COLUMN_IDS = [
	'tenantName',
	'govId',
	'start',
	'end',
	'cost',
	'status'
] as const;

export type ContractSortColumnId = (typeof CONTRACT_SORT_COLUMN_IDS)[number];

/**
 * The statuses a contract in force holds — the ones whose period covers today and which
 * nobody has ended by hand. This is what "the tenant's active contracts" counts.
 *
 * `fulfilled` is in force: it is a running contract that happens to be paid up, and a
 * tenant's count dropping to zero the moment they settle would be wrong. `defaulted` is
 * not: the period has passed and only the debt remains, which the contracts queue chases
 * rather than the directory. `scheduled` has not started and `terminated` was ended.
 *
 * Derived from the same reading of the status model as `deriveContractStatus`, and stated
 * here rather than at each caller so a status added to the enum has one place to be
 * classified.
 */
export const CONTRACT_IN_FORCE_STATUSES = [
	'active',
	'fulfilled'
] as const satisfies readonly Contract['status'][];

/**
 * The statuses a contract holds while it still occupies the units assigned to it.
 *
 * Wider than "in force" by `defaulted`, and that is the whole difference: a tenant who owes
 * money is still living in the unit, so a board that showed it vacant would be describing a
 * space nobody can let. Occupancy also asks a second question this list cannot answer —
 * whether today falls inside the contract's period — so a caller pairs the two.
 */
export const CONTRACT_OCCUPYING_STATUSES = [
	'active',
	'fulfilled',
	'defaulted'
] as const satisfies readonly Contract['status'][];

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

// --- Rules asserted before persisting -------------------------------------------------
//
// Each throws the user-facing BAD_REQUEST the routers previously raised inline. Routers
// fetch the rows a rule needs and call in; the condition and its message live here.

/**
 * The refusal every rule in this domain raises: a `BAD_REQUEST` whose message is shown to the
 * user verbatim. Exported so a rule kept in a sibling file — renewal's — refuses in the same
 * shape rather than assembling a second one that only looks the same.
 */
export function badRequest(message: string): never {
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

/**
 * the router passes whatever row its uniqueness query found; any row is a conflict.
 *
 * @param named the government id itself, where the caller is acting on a set and has to say
 * which member of it was refused. A caller acting on one contract omits it.
 */
export function ensureGovIdAvailable(conflicting: unknown, named?: string) {
	if (conflicting) {
		badRequest(`government id${named ? ` ${named}` : ''} is associated with another contract`);
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

/**
 * What stops a contract being deleted, or `undefined` where nothing does.
 *
 * The rule itself, and the only rendering of it: a contract may hold no unit and carry no
 * payment. It answers with *which* of the two rather than with a yes or a no, because a
 * selection of contracts is turned away for both reasons at once and a reader who is only told
 * that some of them cannot go has nothing to act on.
 */
export function whatBlocksContractDeletion(units: unknown[], payments: unknown[]) {
	if (units.length > 0) {
		return 'holds-units' as const;
	}

	return payments.length > 0 ? ('holds-payments' as const) : undefined;
}

/** What a contract's deletion can be blocked by, which is what a plan over a selection reports. */
export type ContractDeletionBlocker = NonNullable<ReturnType<typeof whatBlocksContractDeletion>>;

/**
 * Whether a contract may be deleted.
 *
 * Exported beside the rule that enforces it for the reason `isTenantDeletable` states.
 */
export const isContractDeletable = (units: unknown[], payments: unknown[]) =>
	whatBlocksContractDeletion(units, payments) === undefined;

export function ensureContractDeletable(units: unknown[], payments: unknown[]) {
	const blocker = whatBlocksContractDeletion(units, payments);

	if (blocker === 'holds-units') {
		badRequest('cannot delete contract with associated units');
	}

	if (blocker === 'holds-payments') {
		badRequest('cannot delete contract with associated payments');
	}
}

/**
 * The three things a reader can ask of a selection of contracts at once.
 *
 * Named here rather than in the router, because which actions a contract admits is the concept's
 * to say and the procedure only takes the answer as an input.
 */
export const CONTRACT_SELECTION_ACTIONS = ['terminate', 'restore', 'delete'] as const;

export type ContractSelectionAction = (typeof CONTRACT_SELECTION_ACTIONS)[number];

/** Why one contract would be turned away from one of those actions. */
export type ContractRefusalReason =
	'missing' | 'not-terminable' | 'not-restorable' | ContractDeletionBlocker;

/**
 * Why this action would turn this contract away, or `undefined` where it would go through.
 *
 * One question with three answers rather than three questions, so a surface offering all three
 * on one selection asks the domain once per contract in the same words each time. Every answer
 * is one of the predicates above, called rather than restated.
 */
export function whatRefusesContractAction(
	action: ContractSelectionAction,
	contract: ContractLike,
	payments: PaymentLike[],
	assignments: unknown[],
	now: DateLike
): ContractRefusalReason | undefined {
	switch (action) {
		case 'terminate':
			// the derived status rather than the stored one, exactly as terminating one contract
			// does: what a contract owes moves at a UTC day boundary, and a row read before one is
			// stale against the rule about to be applied to it.
			return canManuallyTerminateContractStatus(deriveContractStatus(contract, payments, now))
				? undefined
				: 'not-terminable';
		case 'restore':
			return canUnterminateContractStatus(contract.status) ? undefined : 'not-restorable';
		case 'delete':
			return whatBlocksContractDeletion(assignments, payments);
	}
}

export function ensurePeriodDoesNotOverlapAssignments(
	assignments: UnitAssignmentLike[],
	range: ContractRangeLike,
	contractId: string
) {
	if (getConflictingAssignedUnitIds(assignments, range, contractId).size > 0) {
		badRequest('assigned units overlap with another contract during the selected dates');
	}
}

export function ensureUnitsAssignable(
	assignments: UnitAssignmentLike[],
	contract: ContractRangeLike,
	contractId: string
) {
	if (getConflictingAssignedUnitIds(assignments, contract, contractId).size > 0) {
		badRequest('one or more selected units are already assigned to an overlapping contract');
	}
}

/**
 * What a contract is called, wherever one has to be named outside its own page.
 *
 * Its reference where it has one, the tenant holding it otherwise, and the concept's own word
 * where it has neither — a contract is identified by what a person would say, never by the row
 * id, which means nothing to anyone reading a history entry or a file.
 */
export function toContractName(
	contract: { govId?: string | null; tenantName?: string | null },
	fallback: string
) {
	return contract.govId?.trim() || contract.tenantName?.trim() || fallback;
}
