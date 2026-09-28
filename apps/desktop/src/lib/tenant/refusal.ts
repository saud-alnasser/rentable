/**
 * Every refusal a tenant rule or procedure raises, by code. The sentences are the interface's,
 * under `common.refusals.tenant`; see `$lib/api/refusal`.
 */
export type TenantRefusalCode =
	| 'tenant.nationalIdTaken'
	| 'tenant.nationalIdTakenNamed'
	| 'tenant.phoneTaken'
	| 'tenant.phoneTakenNamed'
	| 'tenant.gone'
	| 'tenant.holdsContracts'
	| 'tenant.repeatedInSet';
