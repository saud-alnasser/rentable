// The command menu's strings in english, composed back into `i18n/en/index.ts` at the
// `commandPalette`, `commandPaletteActDoesNotApply`, `commandPaletteChooseRecord`,
// `commandPaletteDescription`, `commandPaletteEmpty` and `commandPaletteGoTo` keys of `common.ui`,
// and at `common.actions`. It imports nothing but types, because the typesafe-i18n generator
// transpiles it along with the locale.

import type { BaseTranslation } from '../../i18n/i18n-types';

export const ui = {
	commandPalette: 'command palette',
	commandPaletteActDoesNotApply: '{act} does not apply to {record}.',
	commandPaletteChooseRecord: 'type to find the record this runs on.',
	commandPaletteDescription: 'search for a command to run',
	commandPaletteEmpty: 'no matches found',
	commandPaletteGoTo: 'go to'
} satisfies BaseTranslation;

// the heading of the menu's group of acts, composed back at `common.actions`.
export const common = {
	actions: {
		actions: 'actions'
	}
} satisfies BaseTranslation;
