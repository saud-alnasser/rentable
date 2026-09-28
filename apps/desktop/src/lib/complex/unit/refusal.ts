/**
 * Every refusal a unit rule or procedure raises, by code. The sentences are the interface's, under
 * `common.refusals.unit`; see `$lib/api/refusal`.
 */
export type UnitRefusalCode =
	| 'unit.holdsContracts'
	| 'unit.nameTaken'
	| 'unit.nameTakenNamed'
	| 'unit.gone'
	| 'unit.nameRepeated'
	| 'unit.repeatedInSet';
