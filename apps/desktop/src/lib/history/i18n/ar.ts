// The history capability's strings in arabic, composed back into `i18n/ar/index.ts` at
// `common.history`. It imports nothing but types, because the typesafe-i18n generator transpiles it
// along with the locale. Each object satisfies its own slice of the generated types, so a key
// missing, left over or without its placeholder fails here.

import type { Translation } from '../../i18n/i18n-types';

export const common = {
	history: {
		actions: {
			assigned: 'تغيرت الوحدات',
			created: 'أنشئ',
			deleted: 'حذف',
			edited: 'عدل',
			renewed: 'جدد',
			terminated: 'أنهي',
			unterminated: 'أعيد'
		},
		emptyDescription: 'ستظهر هنا التغييرات التي تجرى على هذا السجل.',
		emptyTitle: 'لم يحدث شيء لهذا السجل بعد.',
		title: 'السجل الزمني'
	}
} satisfies Pick<Translation['common'], 'history'>;
