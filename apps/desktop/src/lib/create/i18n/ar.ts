// The create capability's strings in arabic, composed back into `i18n/ar/index.ts` at the
// `nothingToCreateHere` key of `common.ui`, and at `common.actions`. It imports nothing but types,
// because the typesafe-i18n generator transpiles it along with the locale. Each object satisfies
// its own slice of the generated types, so a key missing, left over or without its placeholder
// fails here.

import type { Translation } from '../../i18n/i18n-types';

export const ui = {
	nothingToCreateHere: 'لا شيء في هذه الشاشة يقبل سجلاً جديداً'
} satisfies Pick<Translation['common']['ui'], 'nothingToCreateHere'>;

// the create control's label where a list names no concept, composed back at `common.actions`.
export const common = {
	actions: {
		newRecord: 'سجل جديد'
	}
} satisfies { actions: Pick<Translation['common']['actions'], 'newRecord'> };
