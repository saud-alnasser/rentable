// The history capability's strings in english, composed back into `i18n/en/index.ts` at
// `common.history`. It imports nothing but types, because the typesafe-i18n generator transpiles it
// along with the locale.

import type { BaseTranslation } from '../../i18n/i18n-types';

export const common = {
	history: {
		// past tense, and their own words rather than undo's: an account says what happened,
		// where an undo offer names the thing it is about to take back.
		actions: {
			assigned: 'units changed',
			created: 'created',
			deleted: 'deleted',
			edited: 'edited',
			renewed: 'renewed',
			terminated: 'terminated',
			unterminated: 'restored'
		},
		emptyDescription: 'changes made to this record will be listed here.',
		emptyTitle: 'nothing has happened to this record yet.',
		title: 'history'
	}
} satisfies BaseTranslation;
