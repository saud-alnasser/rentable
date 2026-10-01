// The startup feature's strings in arabic, composed back into `i18n/ar/index.ts` at
// `layout.startup` and `common.actions`. It imports nothing but types, because the typesafe-i18n
// generator transpiles it along with the locale. Each object satisfies its own slice of the
// generated types, so a key missing, left over or without its placeholder fails here.

import type { Translation } from '../../i18n/i18n-types';

export const layout = {
	startup: {
		factUpdatingTo: 'الترقية إلى',
		failedToStartFallback: 'فشل في تشغيل التطبيق.',
		failureDescription: 'تعذر فتح مساحة عملك. لا شيء فيها في خطر، فجرّب التشغيل مجددًا.',
		failureTitle: 'تعذر على rentable إكمال التشغيل',
		previousVersion: 'الإصدار السابق',
		recoveryDetails:
			'لا شيء في مساحة العمل هذه في خطر، فلدى هذا الجهاز نسخة منها. وإذا استمر الفشل، فأعد تثبيت الإصدار السابق.',
		recoveryRequiredTitle: 'مطلوب استرداد التحديث',
		stageAccount: 'التحقق من حسابك',
		stageChanges: 'البحث عن التغييرات',
		stageRecords: 'تحديث السجلات',
		migrationApplying:
			'يجري رفع مساحة العمل إلى هذا الإصدار من rentable. يصل هذا إلى Turso ويستغرق لحظة؛ لا شيء هنا عالق.',
		migrationWaiting:
			'عضو آخر يرفع مساحة العمل إلى هذا الإصدار من rentable. ننتظره، حتى {until} على أبعد تقدير.',
		stagePrepare: 'إنشاء مساحة عملك الأولى',
		stageSettings: 'قراءة إعداداتك',
		stageWorkspace: 'فتح مساحة عملك',
		switching: 'جارٍ فتح {name}'
	}
} satisfies Pick<Translation['layout'], 'startup'>;

// the controls the startup's failure and recovery screens offer, composed back at
// `common.actions`.
export const common = {
	actions: {
		openPreviousRelease: 'فتح الإصدار السابق',
		retryStartup: 'إعادة محاولة التشغيل'
	}
} satisfies {
	actions: Pick<Translation['common']['actions'], 'openPreviousRelease' | 'retryStartup'>;
};
