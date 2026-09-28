// The shortcut capability's strings in english, composed back into `i18n/en/index.ts` at the
// `keyboardShortcuts` and `keyboardShortcutsDescription` keys of `common.ui`. It imports nothing
// but types, because the typesafe-i18n generator transpiles it along with the locale.

import type { BaseTranslation } from '../../i18n/i18n-types';

export const ui = {
	keyboardShortcuts: 'keyboard shortcuts',
	keyboardShortcutsDescription: 'every key this application answers, wherever you are.'
} satisfies BaseTranslation;
