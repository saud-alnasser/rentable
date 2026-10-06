import type { Database } from '$lib/api/context';
import type { ContributedRead } from '$lib/feature/surface';
import type { Contract, Payment, payment } from '$lib/platform/database/schema';
import { toUtcDay, type DateLike } from '$lib/date';
import { refuse } from '$lib/api/refusal';
import {
	CONTRACT_END_DATE_TOLERANCE_DAYS,
	getContractTotalCost,
	getExpectedAmountBy,
	hasValidContractPeriodForInterval
} from '$lib/contract/schedule/cycle';

/**
 * CONTRACT
 *
 * the contract domain module: status derivation, period and cost invariants, what a contract
 * owes, and the rules routers assert before persisting. Routers fetch rows and call in. The cycle
 * arithmetic those read is `./schedule/cycle`, and the units a contract holds are
 * `./assignment/assignment`. What a payment is worth on its own is `$lib/payment/payment`;
 * everything that weighs payments against a contract is here, what they add up to included: the
 * payment depends on the contract, never the other way round, so the payments a contract is weighed
 * against arrive as rows its caller hands in, or through what the payment contributes
 * ({@link ContractContributions}).
 */

/**
 * a payment as a caller holds it, with the date in whichever form it arrived. One that names no
 * direction was received, as the column's own default reads a row written before it had one.
 */
export type PaymentLike = Omit<Pick<Payment, 'amount' | 'date'>, 'date'> & {
	date: DateLike;
	direction?: Payment['direction'];
};

/** whether a payment is money returned to the tenant rather than money received from them. */
export function isRefund(payment: Pick<PaymentLike, 'direction'>) {
	return payment.direction === 'refund';
}

/** what the contract received: every payment that is not a refund. */
export function getReceivedAmount(payments: PaymentLike[]) {
	return payments.reduce((sum, payment) => (isRefund(payment) ? sum : sum + payment.amount), 0);
}

/** what the contract returned to its tenant: every refund. */
export function getRefundedAmount(payments: PaymentLike[]) {
	return payments.reduce((sum, payment) => (isRefund(payment) ? sum + payment.amount : sum), 0);
}

/**
 * What a contract counts as paid: what it received less what it returned (effort 854, requirement
 * 27). Every figure that weighs payments against the contract reads this, so its status, schedule,
 * outstanding and paid in full all follow the net. What the landing page reports as collected is
 * not a settlement and stays every payment received, as recorded.
 */
export function getPaidAmount(payments: PaymentLike[]) {
	return getReceivedAmount(payments) - getRefundedAmount(payments);
}

/**
 * What the contract's procedures need of the payments made against it, contributed by the payment,
 * which depends on the contract rather than the other way round (`$lib/feature/feature`, under
 * *What a feature contributes*).
 */
export type ContractContributions = {
	/**
	 * every payment made against each of the contracts named, by the contract's id, in the order the
	 * rows are read; a contract nobody paid against is absent. No contract named reads nothing.
	 */
	paymentsOf: (
		db: Database,
		contractIds: readonly string[]
	) => Promise<Map<string, (typeof payment.$inferSelect)[]>>;
};

/** What the contract's host needs of the payments made against it, in the window. */
export type ContractSurfaceContributions = {
	/**
	 * every payment made against the contract, read only while `enabled` says so: what refuses its
	 * deletion ({@link isContractDeletable}).
	 */
	useHeldPayments: (contractId: () => string, enabled: () => boolean) => ContributedRead<unknown[]>;
	/** whether the reader may see payments at all, and so the figures a row carries of them. */
	viewsPayments: () => boolean;
};

export type ContractLike = Omit<
	Pick<Contract, 'status' | 'start' | 'end' | 'interval' | 'cost'>,
	'start' | 'end'
> & {
	start: DateLike;
	end: DateLike;
};

/** the tolerance every comparison of money in this domain allows, so float dust is never a debt. */
export const EPSILON = 0.0001;

export function getContractPaymentSummary(contract: ContractLike, payments: PaymentLike[]) {
	return {
		paidAmount: getPaidAmount(payments),
		expectedAmount: getContractTotalCost(contract)
	};
}

/**
 * The most a refund against this contract may return (effort 854, requirement 26).
 *
 * A terminated contract may return what it received, less what it already returned. One that is
 * not terminated may return only what it received past its total cost, less what it already
 * returned, so a refund never makes it owe. Never below nothing.
 */
export function getRefundableAmount(contract: ContractLike, payments: PaymentLike[]) {
	const received = getReceivedAmount(payments);
	const refunded = getRefundedAmount(payments);
	const returnable =
		contract.status === 'terminated'
			? received - refunded
			: received - getContractTotalCost(contract) - refunded;

	return Math.max(0, returnable);
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

/**
 * What a new payment against this contract most likely is: the amount due this cycle, capped at
 * what the contract still owes. It is the payment form's default ([[rules/interface]],
 * *Guidance*), so a reader recording an ordinary rent confirms a figure rather than typing one.
 *
 * Read from the aggregates reconcile materializes, as the balance is. What is due by today less
 * what is paid is the gap: where it is a cycle or more (arrears), the cycle's rent is due; where it
 * is part of one, that part is; where nothing is due yet, the next cycle's rent is what a reader
 * paying ahead is paying. A contract that owes nothing has nothing due. Rounded to the halala,
 * because the gap is a difference of floats and the form refuses a figure finer than that.
 */
export function getAmountDueThisCycle(
	contract: ContractLike & Pick<Contract, 'paidAmount' | 'expectedAmount'>,
	now: DateLike
) {
	const remaining = getRemainingContractBalance(contract.paidAmount, contract.expectedAmount);

	if (remaining <= 0) {
		return 0;
	}

	const gap = getExpectedAmountBy(contract, now) - contract.paidAmount;
	const dueThisCycle = gap > EPSILON ? Math.min(gap, contract.cost) : contract.cost;

	return Math.round(Math.min(dueThisCycle, remaining) * 100) / 100;
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

/**
 * Whether an amount is one a contract may cost.
 *
 * Above zero, and the boundary is the whole of it: a contract costing nothing has a total cost of
 * nothing, which every payment requirement is satisfied by, so it reconciles to `fulfilled` having
 * taken no money. That is a contract the status model cannot describe rather than a cheap one.
 *
 * Exported as {@link hasValidContractPeriodForInterval} is, because this rule's two callers have
 * to agree:
 * {@link ensureValidContractInput} refuses a write with it, and the workspace transfer's planning
 * pass answers the same question about a file before the write is attempted. The copy it replaces
 * there admitted zero. `contract/form.ts` still states the rule a third time, in the form's
 * own schema, and folding that in is not this change's.
 */
export function hasValidContractCost(cost: number) {
	return cost > 0;
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

// --- Rules asserted before persisting -------------------------------------------------
//
// Each throws the refusal the routers previously raised inline. Routers fetch the rows a rule
// needs and call in; the condition and its code live here.

export function ensureValidContractInput(
	input: Pick<Contract, 'start' | 'end' | 'interval' | 'cost'>
) {
	if (input.end < input.start) {
		throw refuse('contract.endBeforeStart');
	}

	if (!hasValidContractPeriodForInterval(input)) {
		throw refuse('contract.periodOffCycle', {
			days: CONTRACT_END_DATE_TOLERANCE_DAYS,
			interval: input.interval
		});
	}

	if (!hasValidContractCost(input.cost)) {
		throw refuse('contract.costNotPositive');
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
		throw named ? refuse('contract.govIdTakenNamed', { named }) : refuse('contract.govIdTaken');
	}
}

export function ensureContractIsNotTerminated(status: Contract['status']) {
	if (status === 'terminated') {
		throw refuse('contract.terminatedLocked');
	}
}

export function ensureContractTerminable(status: Contract['status']) {
	if (!canManuallyTerminateContractStatus(status)) {
		throw refuse('contract.notTerminable');
	}
}

export function ensureContractUnterminable(status: Contract['status']) {
	if (!canUnterminateContractStatus(status)) {
		throw refuse('contract.notUnterminable');
	}
}

export function ensureContractUnitsAreMutable(payments: unknown[]) {
	if (payments.length > 0) {
		throw refuse('contract.unitsLockedByPayments');
	}
}

export function ensureContractPaymentsCreatable(contract: ContractLike, payments: PaymentLike[]) {
	if (isContractPaidInFull(contract, payments)) {
		throw refuse('contract.paidInFull');
	}
}

/**
 * A refund may return no more than the contract's state lets it ({@link getRefundableAmount}),
 * weighed against every payment it holds other than the refund being written. The refusal names
 * the limit, rounded to the halala the form takes, so the reader is told the figure to stay within.
 */
export function ensureRefundWithinLimit(
	contract: ContractLike,
	payments: PaymentLike[],
	amount: number
) {
	const limit = getRefundableAmount(contract, payments);

	if (amount > limit + EPSILON) {
		throw refuse('contract.refundAboveLimit', { limit: Math.round(limit * 100) / 100 });
	}
}

/**
 * Whether what a contract returned stays within what it received: the one rule about refunds that
 * holds whatever the contract's state (effort 854, requirement 26).
 *
 * Exported beside the assertion that raises on it because a selection of payments plans its
 * deletion against it before any write, as {@link whatBlocksContractDeletion} is.
 */
export function areRefundsCovered(payments: PaymentLike[]) {
	return getRefundedAmount(payments) <= getReceivedAmount(payments) + EPSILON;
}

/**
 * Refuses a write that would leave a contract having returned more than it received: lowering or
 * deleting a payment it received, or putting refunds back. Anything short of that goes through,
 * and a live contract then owes what was returned.
 */
export function ensureRefundsCovered(payments: PaymentLike[]) {
	if (!areRefundsCovered(payments)) {
		throw refuse('contract.refundsExceedReceived');
	}
}

/**
 * What stops a contract being deleted, or `undefined` where nothing does.
 *
 * The rule itself, and the only rendering of it: a contract may carry no payment. It answers with
 * *what* stops it rather than with a yes or a no, because a selection of contracts is turned away
 * by reason and a reader who is only told that some of them cannot go has nothing to act on.
 *
 * **The units it holds do not stop it.** They go with it, in the same batch, and undoing the
 * deletion puts them back with it, as undoing a creation already takes them away (effort 832,
 * criterion 11(a)). A contract is created holding its units, so a rule refusing one for holding
 * them refused nearly every contract that had taken no money.
 */
export function whatBlocksContractDeletion(payments: unknown[]) {
	return payments.length > 0 ? ('holds-payments' as const) : undefined;
}

/** What a contract's deletion can be blocked by, which is what a plan over a selection reports. */
export type ContractDeletionBlocker = NonNullable<ReturnType<typeof whatBlocksContractDeletion>>;

/**
 * Whether a contract may be deleted.
 *
 * Exported beside the rule that enforces it for the reason `isTenantDeletable` states.
 */
export const isContractDeletable = (payments: unknown[]) =>
	whatBlocksContractDeletion(payments) === undefined;

export function ensureContractDeletable(payments: unknown[]) {
	if (whatBlocksContractDeletion(payments) === 'holds-payments') {
		throw refuse('contract.holdsPayments');
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
	'missing' | 'not-terminable' | 'not-restorable' | 'units-taken' | ContractDeletionBlocker;

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
	now: DateLike,
	// whether another live contract holds one of its units over its term, which only a restore
	// asks: the caller reads the assignments and answers it (`assignment/assignment.ts`), since the
	// rule about holding a unit is the assignment's.
	{ unitsTaken = false }: { unitsTaken?: boolean } = {}
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
			if (!canUnterminateContractStatus(contract.status)) {
				return 'not-restorable';
			}

			return unitsTaken ? 'units-taken' : undefined;
		case 'delete':
			return whatBlocksContractDeletion(payments);
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
