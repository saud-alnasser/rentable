// The print capability's strings in arabic, composed back into `i18n/ar/index.ts` at `print`. It
// imports nothing but types, because the typesafe-i18n generator transpiles it along with the
// locale. Each object satisfies its own slice of the generated types, so a key missing, left over
// or without its placeholder fails here.

import type { Translation } from '../../i18n/i18n-types';

export const print = {
	failed: 'تعذّرت طباعة الصفحة.',
	language: 'لغة الصفحة',
	print: 'طباعة',
	save: 'حفظ كملف PDF',
	saved: 'تم حفظ ملف PDF'
} satisfies Translation['print'];
