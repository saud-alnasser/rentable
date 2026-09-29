import type { RefusalField } from '$lib/error/refusal';

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

/** the field of the unit's form each of its refusals belongs under, where one does. */
export const UNIT_REFUSAL_FIELDS = {
	// a collision within the submitted list belongs to the list rather than to one name field.
	'unit.nameRepeated': 'units',
	'unit.nameTaken': 'name',
	'unit.nameTakenNamed': 'name'
} satisfies Partial<Record<UnitRefusalCode, RefusalField>>;
