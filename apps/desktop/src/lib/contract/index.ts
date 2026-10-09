/**
 * THE CONTRACT'S ENTRY
 *
 * what another concept may import of the contract: the types a feature depending on the contract
 * names (what the contract needs of it, which that feature contributes, and the shape of a payment
 * the contract weighs), and the rules a payment and the dashboard read the contract by: what is
 * owed and when, whether it may take a payment, its rank, how a changed payment is reconciled into
 * it, and how it is serialized and named. Its refusals and the fields they belong under are here for
 * the composition root's union of them (`$lib/app/refusal`).
 *
 * **It loads under Node**, since the payment's and the dashboard's routers import it and a Node
 * test loads every router. The contract's reads and its host are the window's, in `./ui`.
 */
export {
	ensureContractIsNotTerminated,
	ensureContractPaymentsCreatable,
	ensureRefundsCovered,
	ensureRefundWithinLimit,
	areRefundsCovered,
	CONTRACT_KIND,
	getAmountDueThisCycle,
	getPaidAmount,
	getRefundableFromTotals,
	getRefundedAmount,
	getRemainingContractBalance,
	hasSatisfiedContractPaymentRequirement,
	isRefund,
	toContractName,
	type ContractContributions,
	type ContractLike,
	type ContractSurfaceContributions,
	type PaymentLike
} from './contract';
export {
	compareContractsByRank,
	getContractRank,
	getDueSoonCycle,
	isContractEndingSoon,
	isMoneyRank,
	summarizeContractRanks,
	type ContractRank,
	type ContractRankSummary
} from './rank/rank';
export { withContractRank } from './rank/filter';
export { reconcileTouched } from './reconcile';
export {
	getContractTotalCost,
	getExpectedAmountBy,
	getExpectedAmountInRange
} from './schedule/cycle';
export { isReminderRank } from './schedule/reminder';
export {
	compareByAllocationOrder,
	scheduleContract,
	type SchedulePaymentLike
} from './schedule/schedule';
export { CONTRACT_REFUSAL_FIELDS, type ContractRefusalCode } from './refusal';
export { serializeContract } from './serialize';
