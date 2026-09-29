// The unit's strings in english, composed back into `i18n/en/index.ts` at `common.actions`,
// `common.labels` and `common.refusals.unit`. It imports nothing but types, because the
// typesafe-i18n generator transpiles it along with the locale.

import type { BaseTranslation } from '../../../i18n/i18n-types';

// the create control's label on the unit's list, composed back at `common.actions`, and the unit's
// name for one of itself, at `common.labels`.
export const common = {
	actions: {
		newUnit: 'new unit'
	},
	labels: {
		unit: 'unit'
	}
} satisfies BaseTranslation;

// what a unit's refusal says, by the code it was raised with, composed back at
// `common.refusals.unit`.
export const refusals = {
	unit: {
		gone: 'this unit is no longer in the workspace. reload to see what changed.',
		holdsContracts: 'a contract mentions this unit, so it cannot be deleted.',
		nameRepeated: '{name:string} is used twice; each unit needs its own name.',
		nameTaken: 'name is associated with a unit in the same complex.',
		nameTakenNamed: 'the name {named:string} is associated with a unit in the same complex.',
		repeatedInSet: 'two units in this set claim {value:string}.'
	}
} satisfies BaseTranslation;
