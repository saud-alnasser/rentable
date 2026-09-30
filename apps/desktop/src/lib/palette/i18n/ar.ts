// The command menu's strings in arabic, composed back into `i18n/ar/index.ts` at the
// `commandPalette`, `commandPaletteActDoesNotApply`, `commandPaletteChooseRecord`,
// `commandPaletteDescription`, `commandPaletteEmpty` and `commandPaletteGoTo` keys of `common.ui`,
// and at `common.actions`. It imports nothing but types, because the typesafe-i18n generator
// transpiles it along with the locale. Each object satisfies its own slice of the generated types,
// so a key missing, left over or without its placeholder fails here.

import type { Translation } from '../../i18n/i18n-types';

export const ui = {
	commandPalette: 'لوحة الأوامر',
	commandPaletteActDoesNotApply: 'لا ينطبق «{act}» على {record}.',
	commandPaletteChooseRecord: 'اكتب للبحث عن السجل الذي سينفذ عليه.',
	commandPaletteDescription: 'ابحث عن أمر للتنفيذ',
	commandPaletteEmpty: 'لا توجد نتائج مطابقة',
	commandPaletteGoTo: 'الانتقال إلى'
} satisfies Pick<
	Translation['common']['ui'],
	| 'commandPalette'
	| 'commandPaletteActDoesNotApply'
	| 'commandPaletteChooseRecord'
	| 'commandPaletteDescription'
	| 'commandPaletteEmpty'
	| 'commandPaletteGoTo'
>;

// the heading of the menu's group of acts, composed back at `common.actions`.
export const common = {
	actions: {
		actions: 'الإجراءات'
	}
} satisfies { actions: Pick<Translation['common']['actions'], 'actions'> };
