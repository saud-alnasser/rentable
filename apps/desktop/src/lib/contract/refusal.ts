/**
 * Every refusal a contract rule or procedure raises, by code. The sentence each stands for is the
 * interface's, under `common.refusals.contract`, and `error/refusal.ts` is where a form learns
 * which field one belongs under.
 *
 * The `...Named` codes carry the value a set-wide call has to say back, because a reader told that
 * one of several records was refused has nothing to act on.
 */
export type ContractRefusalCode =
	| 'contract.endBeforeStart'
	| 'contract.periodOffCycle'
	| 'contract.costNotPositive'
	| 'contract.govIdTaken'
	| 'contract.govIdTakenNamed'
	| 'contract.terminatedLocked'
	| 'contract.notTerminable'
	| 'contract.notUnterminable'
	| 'contract.nothingToRemind'
	| 'contract.unitsLockedByPayments'
	| 'contract.paidInFull'
	| 'contract.holdsPayments'
	| 'contract.periodOverlapsUnits'
	| 'contract.unitsUnavailable'
	| 'contract.unitsTaken'
	| 'contract.renewalBeforeEnd'
	| 'contract.missing'
	| 'contract.tenantMissing'
	| 'contract.tenantMissingNamed'
	| 'contract.repeatedInSet'
	| 'contract.unitsMissing';
