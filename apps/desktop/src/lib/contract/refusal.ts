import type { RefusalField } from '$lib/error/refusal';

/**
 * Every refusal a contract rule or procedure raises, by code. The sentence each stands for is the
 * interface's, under `common.refusals.contract`, and `CONTRACT_REFUSAL_FIELDS` below is where a
 * form learns which field one belongs under.
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

/** the field of the contract's form each of its refusals belongs under, where one does. */
export const CONTRACT_REFUSAL_FIELDS = {
	'contract.costNotPositive': 'cost',
	'contract.endBeforeStart': 'end',
	'contract.govIdTaken': 'govId',
	'contract.govIdTakenNamed': 'govId',
	'contract.periodOffCycle': 'end',
	'contract.renewalBeforeEnd': 'start',
	'contract.tenantMissing': 'tenantId',
	'contract.tenantMissingNamed': 'tenantId',
	// both renewal refusals are about the term, so each marks the end of it the reader has to move.
	'contract.unitsUnavailable': 'end',
	// a new contract's units are the reader's choice, so a unit already held marks that choice.
	'contract.unitsTaken': 'unitIds'
} satisfies Partial<Record<ContractRefusalCode, RefusalField>>;
