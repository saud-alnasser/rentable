// The complex feature's strings in english, composed back into `i18n/en/index.ts` at `complexes`,
// `common.refusals.complex`, `common.actions` and `common.labels`. It imports nothing but types,
// because the typesafe-i18n generator transpiles it along with the locale.

import type { BaseTranslation } from '../../i18n/i18n-types';

export const complexes = {
	// what a complex's tile counts, each with its word, since the tile carries no label to name the
	// figure by. A count of zero is never drawn.
	card: {
		occupied: '{count|number} occupied',
		units: '{count|number} {{unit|units}}',
		vacant: '{count|number} vacant'
	},

	// what the delete dialog says of a complex: the units that go with it, or that a contract
	// holding one stands in the way. Every contract that ever mentioned a unit counts, as it does
	// for the unit's own delete.
	deleteDialog: {
		blockedUnitsUnderContract: 'a contract mentions one or more of its units',
		unitsGoWithIt:
			'its {count|number} {{unit|units}} will be deleted with it. you can undo this while the app is open.'
	},

	empty: {
		description: 'complexes you add, with their units, will be listed here.',
		title: 'no complexes yet'
	},

	hooks: {
		createSuccess: 'complex created successfully!',
		deleteManySuccess: '{count|number} complex(es) deleted',
		deleteSuccess: 'complex deleted successfully!',
		unitCreateManySuccess: '{count|number} {{unit|units}} created',
		unitCreateSuccess: 'unit created successfully!',
		unitDeleteManySuccess: '{count|number} {{unit|units}} deleted',
		unitDeleteSuccess: 'unit deleted successfully!',
		unitUpdateSuccess: 'unit updated successfully!',
		updateSuccess: 'complex updated successfully!'
	},

	form: {
		duplicateUnitName: '{name:string} is already in the list.',
		nameRequired: 'give the complex a name.',
		noUnitNamed: 'name at least one unit.',
		noUnitsYet: 'no units yet. add them here, or later from the complex itself.',
		unitName: 'unit name',
		unitNotAdded: 'add this unit with + first, or clear it.',
		unitRangeEndBeforeStart: 'the last number must not be below the first.',
		unitRangeHint: 'one name, or a run — "a 1-18" adds a 1 through a 18.',
		unitRangeTooLarge: 'a run adds at most {max:number} units at a time.'
	},

	selection: {
		deleteSummary: '{count|number} complex(es) will be deleted',
		deleteSummaryWithUnits:
			'{count|number} complex(es) will be deleted, with {units|number} {{unit|units}}',
		deleteTitle: 'delete complexes',
		refusedDeletesUnits: '{count|number} have units you may not delete',
		refusedMissing: '{count|number} are no longer in the workspace',
		refusedUnitsUnderContract: '{count|number} have units a contract mentions',
		unitDeleteSummary: '{count|number} {{unit|units}} will be deleted',
		unitDeleteTitle: 'delete units',
		// every contract that ever mentioned it, not the one holding it today: a unit reading
		// as vacant on the list can still be one no deletion may touch.
		unitRefusedHoldsContracts: '{count|number} are mentioned by a contract',
		unitRefusedMissing: '{count|number} are no longer in the workspace'
	},

	units: {
		contractsEmptyDescription: 'contracts that mention this unit will appear here.',
		contractsEmptyTitle: 'no contracts mention this unit',
		emptyDescription: 'units you add to this complex will be listed here.',
		emptyTitle: 'no units in this complex yet',
		management: 'units management'
	}
} satisfies BaseTranslation;

export const refusals = {
	complex: {
		gone: 'this complex is no longer in the workspace. reload to see what changed.',
		nameTaken: 'name is associated with a previously registered complex.',
		nameTakenNamed: 'the name {named:string} is associated with a previously registered complex.',
		repeatedInSet: 'two complexes in this set claim {value:string}.',
		unitsUnderContract:
			'a contract mentions one or more of its units, so this complex cannot be deleted.'
	}
} satisfies BaseTranslation;

// the create control's label on this feature's list, composed back at `common.actions`, and the
// complex's column labels, at `common.labels`.
export const common = {
	actions: {
		newComplex: 'new complex'
	},
	labels: {
		location: 'location',
		occupiedUnits: 'occupied units',
		vacantUnits: 'vacant units'
	}
} satisfies BaseTranslation;
