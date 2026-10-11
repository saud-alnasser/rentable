// The dashboard feature's strings in english, composed back into `i18n/en/index.ts` at `dashboard`.
// It imports nothing but types, because the typesafe-i18n generator transpiles it along with the
// locale.

import type { BaseTranslation } from '../../i18n/i18n-types';

export const dashboard = {
	empty: {
		description: 'nothing is overdue, behind on payment, or ending inside the notice window.',
		title: 'nothing needs doing today.'
	},

	// the window that decides which contracts rank as ending soon, set from the section it fills
	// (effort 846, requirements 6 and 7).
	endingSoon: {
		change: 'change when a contract is ending soon',
		days: 'days',
		description: 'a contract shows here this many days before it ends.',
		fewer: 'one day fewer',
		invalid: 'enter a whole number of days, one or more.',
		more: 'one day more',
		none: 'none end within the next {days|number} {{day|days}}',
		title: 'ending soon'
	},

	figures: {
		collected: 'collected',
		expected: 'expected',
		occupiedUnits: 'occupied units',
		outstanding: 'outstanding',
		returned: 'returned'
	},

	// the landing screen for a reader whose permissions view none of what it is made of, said rather
	// than left blank (effort 861, after the owner looked at the staged empty landing).
	nothingPermitted: {
		description:
			'it shows contracts, payments and units. someone who can edit your permissions can let you view them.',
		title: 'you have no permission to view anything here.'
	},

	sections: {
		alsoEnding: 'also ending',
		contractCount: '{count|number} {{contract|contracts}}',
		openContract: 'open the contract for {tenant}',
		openContractNumbered: 'open contract {number}',
		openThisContract: 'open the contract',
		seeAll: 'see all ({count|number})'
	},

	title: 'dashboard'
} satisfies BaseTranslation;
