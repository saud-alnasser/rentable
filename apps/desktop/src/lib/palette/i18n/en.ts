// The command menu's strings in english, composed back into `i18n/en/index.ts` at the
// `commandPalette`, `commandPaletteActDoesNotApply`, `commandPaletteChooseRecord`,
// `commandPaletteDescription`, `commandPaletteEmpty` and `commandPaletteGoTo` keys of `common.ui`.
// It imports nothing but types, because the typesafe-i18n generator transpiles it along with the
// locale.

import type { BaseTranslation } from '../../i18n/i18n-types';

export const ui = {
	commandPalette: 'command palette',
	commandPaletteActDoesNotApply: '{act} does not apply to {record}.',
	commandPaletteChooseRecord: 'type to find the record this runs on.',
	commandPaletteDescription: 'search for a command to run',
	commandPaletteEmpty: 'no matches found',
	commandPaletteGoTo: 'go to'
} satisfies BaseTranslation;
