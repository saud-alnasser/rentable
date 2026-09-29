import type { RefusalField } from '$lib/error/refusal';

/**
 * Every refusal a complex rule or procedure raises, by code; a unit's are one level down, in
 * `complex/unit/refusal.ts`. The sentences are the interface's, under `common.refusals`; see
 * `$lib/api/refusal`.
 */
export type ComplexRefusalCode =
	| 'complex.holdsUnits'
	| 'complex.nameTaken'
	| 'complex.nameTakenNamed'
	| 'complex.gone'
	| 'complex.repeatedInSet';

/** the field of the complex's form each of its refusals belongs under, where one does. */
export const COMPLEX_REFUSAL_FIELDS = {
	'complex.nameTaken': 'name',
	'complex.nameTakenNamed': 'name'
} satisfies Partial<Record<ComplexRefusalCode, RefusalField>>;
