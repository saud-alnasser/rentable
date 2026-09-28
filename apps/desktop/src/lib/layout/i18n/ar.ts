// The shell's strings in arabic, composed back into `i18n/ar/index.ts` at `layout.notFound`,
// `layout.error` and `common.window`. It imports nothing but types, because the typesafe-i18n
// generator transpiles it along with the locale. Each object satisfies its own slice of the
// generated types, so a key missing, left over or without its placeholder fails here.

import type { Translation } from '../../i18n/i18n-types';

export const layout = {
	notFound: {
		description: 'ربما كان الرابط الذي أوصلك إلى هنا قديمًا.',
		title: 'هذه الصفحة غير موجودة'
	},

	error: {
		description: 'حدث خطأ في هذه الشاشة. العودة إلى لوحة التحكم تحل المشكلة عادة.',
		goHome: 'الذهاب إلى لوحة التحكم',
		retry: 'المحاولة مرة أخرى',
		shellDescription:
			'حدث خطأ خارج هذه الشاشة، فلا توجد شاشة للعودة إليها. المحاولة مرة أخرى تعيد رسم النافذة من جديد.',
		shellTitle: 'تعذر رسم التطبيق',
		title: 'تعذر عرض هذه الشاشة'
	}
} satisfies Pick<Translation['layout'], 'notFound' | 'error'>;

export const common = {
	window: {
		close: 'إغلاق النافذة',
		minimize: 'تصغير النافذة',
		toggleMaximize: 'تبديل تكبير النافذة'
	}
} satisfies Pick<Translation['common'], 'window'>;
