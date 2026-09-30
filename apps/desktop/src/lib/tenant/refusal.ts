import type { RefusalField } from '$lib/error/refusal';

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

/** the field of the tenant's form each of its refusals belongs under, where one does. */
export const TENANT_REFUSAL_FIELDS = {
	'tenant.nationalIdTaken': 'nationalId',
	'tenant.nationalIdTakenNamed': 'nationalId',
	'tenant.phoneTaken': 'phoneNumber',
	'tenant.phoneTakenNamed': 'phoneNumber'
} satisfies Partial<Record<TenantRefusalCode, RefusalField>>;
