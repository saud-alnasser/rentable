// The unit's strings in arabic, composed back into `i18n/ar/index.ts` at `common.actions`. It
// imports nothing but types, because the typesafe-i18n generator transpiles it along with the
// locale. The object satisfies its own slice of the generated types, so a key missing, left over
// or without its placeholder fails here.

import type { Translation } from '../../../i18n/i18n-types';

// the create control's label on the unit's list, composed back at `common.actions`.
export const common = {
	actions: {
		newUnit: 'وحدة جديدة'
	}
} satisfies { actions: Pick<Translation['common']['actions'], 'newUnit'> };
