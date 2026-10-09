// The dashboard feature's strings in arabic, composed back into `i18n/ar/index.ts` at `dashboard`.
// It imports nothing but types, because the typesafe-i18n generator transpiles it along with the
// locale. Each object satisfies its own slice of the generated types, so a key missing, left over
// or without its placeholder fails here.

import type { Translation } from '../../i18n/i18n-types';

export const dashboard = {
	empty: {
		description: 'لا يوجد متأخر ولا متعثر ولا عقد ينتهي خلال فترة الإشعار.',
		title: 'لا شيء يحتاج إلى إجراء اليوم.'
	},

	endingSoon: {
		change: 'تغيير متى يُعدّ العقد قريب الانتهاء',
		days: 'أيام',
		description: 'يظهر العقد هنا قبل هذا العدد من الأيام من نهايته.',
		fewer: 'يوم أقل',
		invalid: 'أدخل عددًا صحيحًا من الأيام، واحدًا أو أكثر.',
		more: 'يوم أكثر',
		none: 'لا ينتهي أي عقد خلال الأيام الـ{days|number} القادمة',
		title: 'قريب الانتهاء'
	},

	figures: {
		collected: 'المحصل',
		expected: 'المتوقع',
		occupiedUnits: 'الوحدات المشغولة',
		outstanding: 'المستحق',
		returned: 'المُعاد'
	},

	sections: {
		alsoEnding: 'ينتهي أيضاً',
		contractCount: '{count|number} عقد',
		openContract: 'افتح عقد {tenant}',
		openContractNumbered: 'افتح العقد {number}',
		openThisContract: 'افتح العقد',
		seeAll: 'عرض الكل ({count|number})'
	},

	title: 'لوحة التحكم'
} satisfies Translation['dashboard'];
