// The unit's strings in english, composed back into `i18n/en/index.ts` at `common.actions`. It
// imports nothing but types, because the typesafe-i18n generator transpiles it along with the
// locale.

import type { BaseTranslation } from '../../../i18n/i18n-types';

// the create control's label on the unit's list, composed back at `common.actions`.
export const common = {
	actions: {
		newUnit: 'new unit'
	}
} satisfies BaseTranslation;
