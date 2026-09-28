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
