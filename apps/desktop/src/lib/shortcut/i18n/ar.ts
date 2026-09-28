// The shortcut capability's strings in arabic, composed back into `i18n/ar/index.ts` at the
// `keyboardShortcuts` and `keyboardShortcutsDescription` keys of `common.ui`. It imports nothing
// but types, because the typesafe-i18n generator transpiles it along with the locale. Each object
// satisfies its own slice of the generated types, so a key missing, left over or without its
// placeholder fails here.

import type { Translation } from '../../i18n/i18n-types';

export const ui = {
	keyboardShortcuts: 'اختصارات لوحة المفاتيح',
	keyboardShortcutsDescription: 'كل اختصار يستجيب له التطبيق، أينما كنت.'
} satisfies Pick<Translation['common']['ui'], 'keyboardShortcuts' | 'keyboardShortcutsDescription'>;
