// The create capability's strings in english, composed back into `i18n/en/index.ts` at the
// `nothingToCreateHere` key of `common.ui`, and at `common.actions`. It imports nothing but types,
// because the typesafe-i18n generator transpiles it along with the locale.

import type { BaseTranslation } from '../../i18n/i18n-types';

export const ui = {
	nothingToCreateHere: 'nothing on this screen takes a new record'
} satisfies BaseTranslation;

// the create control's label where a list names no concept, composed back at `common.actions`.
export const common = {
	actions: {
		newRecord: 'new record'
	}
} satisfies BaseTranslation;
