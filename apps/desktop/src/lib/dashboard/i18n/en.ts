// The dashboard feature's strings in english, composed back into `i18n/en/index.ts` at `dashboard`.
// It imports nothing but types, because the typesafe-i18n generator transpiles it along with the
// locale.

import type { BaseTranslation } from '../../i18n/i18n-types';

export const dashboard = {
	empty: {
		description: 'nothing is overdue, behind on payment, or ending inside the notice window.',
		title: 'nothing needs doing today.'
	},

	figures: {
		collected: 'collected',
		occupiedUnits: 'occupied units',
		outstanding: 'outstanding'
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
