// The update feature's strings in arabic, composed back into `i18n/ar/index.ts` at `update`. It
// imports nothing but types, because the typesafe-i18n generator transpiles it along with the
// locale. The object satisfies its own slice of the generated types, so a key missing, left over
// or without its placeholder fails here.

import type { Translation } from '../../i18n/i18n-types';

export const update = {
	idle: 'تحقق مما إذا كان قد صدر إصدار أحدث من رينتابل.',
	checking: 'جارٍ البحث عن إصدار أحدث من رينتابل...',
	available: 'يتوفر رينتابل {version}.',
	downloading: 'جارٍ تنزيل رينتابل {version}...',
	ready: 'رينتابل {version} جاهز. أعد التشغيل لإكمال التحديث.',
	installing: 'جارٍ تثبيت رينتابل {version}. سيعمل من جديد تلقائيًا.',
	upToDate: 'لديك أحدث إصدار من رينتابل.',
	offline: 'تعذر على رينتابل الوصول إلى الإنترنت للبحث عن تحديثات. تحقق من اتصالك وحاول مجددًا.',
	failed: 'تعذر إكمال التحديث. حاول مجددًا.',
	actions: {
		check: 'التحقق من التحديثات',
		checking: 'جاري التحقق من التحديثات...',
		download: 'تنزيل',
		restart: 'أعد التشغيل للتحديث',
		tryAgain: 'حاول مجددًا'
	},
	card: {
		title: 'التحديثات',
		description:
			'تحقق من وجود إصدار أحدث وثبّته. وإذا تعذر تشغيل التطبيق بعده، فسيعرض إعادة الإصدار السابق.',
		currentVersion: 'الإصدار الحالي',
		availableVersion: 'الإصدار المتاح',
		state: {
			checking: 'جارٍ التحقق',
			upToDate: 'محدّث',
			available: 'يتوفر تحديث',
			downloading: 'جارٍ التنزيل',
			restart: 'أعد التشغيل لإكماله'
		},
		whatsNew: 'ما الجديد في {version}',
		releasedOn: 'صدر في {date}',
		downloading: 'جاري تنزيل التحديث'
	}
} satisfies Translation['update'];
