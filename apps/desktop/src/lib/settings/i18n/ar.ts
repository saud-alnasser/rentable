// The settings feature's strings in arabic, composed back into `i18n/ar/index.ts` at `settings`,
// `settingsHooks`, `common.actions` and `common.labels`. It imports nothing but types, because the
// typesafe-i18n generator transpiles it along with the locale. Each object satisfies its own slice
// of the generated types, so a key missing, left over or without its placeholder fails here.

import type { Translation } from '../../i18n/i18n-types';

export const settings = {
	diagnosticsDescription:
		'سجل بما يفعله رينتابل لتتبع الأعطال. يبقى هنا، ولا تُكتب فيه كلمات المرور ولا الرموز.',
	diagnosticsReveal: 'فتح مجلد السجل',
	diagnosticsTitle: 'التشخيص',

	downloadingUpdate: 'جاري تنزيل التحديث',

	endingSoonDescription:
		'يظهر العقد في لوحة التحكم ضمن العقود القريبة من الانتهاء قبل هذا العدد من الأيام من نهايته.',
	endingSoonInvalid: 'يجب أن يكون عدد الأيام أكبر من صفر',
	endingSoonTitle: 'قريب من الانتهاء',

	latestRelease: 'أنت تستخدم أحدث إصدار.',

	loadErrorTitle: 'الإعدادات غير متاحة حالياً',

	transferImportTitle: 'استيراد مساحة عمل',
	transferImportSuccess: 'تم استيراد الملف',

	restartNotice: 'تم تثبيت التحديث. أعد تشغيل رينتابل لإكماله.',

	localeDescription: 'تتغير الواجهة بمجرد اختيارك.',
	localeTitle: 'اللغة',

	appearanceTitle: 'المظهر',
	appearanceDescription: 'فاتح أو داكن، أو يتبع نظامك كلما تغيّر.',
	appearance: {
		system: 'النظام',
		light: 'فاتح',
		dark: 'داكن'
	},

	// أقسام الإعدادات السبعة، بترتيب الشريط لا بالترتيب الأبجدي: الترتيب من المتطلب 14
	// ويُقرأ هنا كقائمة.
	section: {
		general: 'عام',
		account: 'حسابك',
		organization: 'المؤسسة',
		workspaces: 'مساحات العمل'
	},

	title: 'الإعدادات',

	updatesChecking: 'جارٍ التحقق من التحديثات...',
	updatesDescription:
		'تحقق من وجود إصدار أحدث وثبّته. وإذا تعذر تشغيل التطبيق بعده، فسيعرض إعادة الإصدار السابق.',
	updatesTitle: 'التحديثات',

	// الأداة الهادئة الوحيدة أسفل كل خطوة من خطوات الدخول (الجهد 843، المتطلب 7).
	wayIn: {
		preferences: 'اللغة والمظهر',
		allSettings: 'كل الإعدادات'
	},

	you: {
		signedInAs: 'مسجل الدخول باسم',
		password: {
			title: 'كلمة المرور',
			description: 'كلمة المرور التي تسجّل بها الدخول، على كل جهاز.',
			currentLabel: 'كلمة المرور الحالية',
			nextLabel: 'كلمة المرور الجديدة',
			confirmLabel: 'كلمة المرور الجديدة مرة أخرى',
			mismatch: 'الاثنتان غير متطابقتين.',
			change: 'غيّر كلمة المرور',
			changed: 'تم تغيير كلمة مرورك.'
		},
		sessions: {
			title: 'الأجهزة الأخرى',
			description: 'سجّل الخروج من كل مكان عدا هنا. كلمة مرورك تبقى كما هي.',
			action: 'سجّل الخروج من الأجهزة الأخرى',
			confirmDescription:
				'يُسجَّل خروجك من كل جهاز آخر. يبقى هذا الجهاز مسجل الدخول، ولا تتغير كلمة مرورك.',
			ended: 'سُجّل الخروج من أجهزتك الأخرى.',
			endedPending: 'هذا الجهاز غير متصل؛ سيصل تسجيل الخروج إلى الأجهزة الأخرى عند عودة الاتصال.'
		},
		ownership: {
			title: 'الملكية',
			offered: 'عرض عليك {owner} هذه المؤسسة. إن قبلتها صرت المالك وصار هو مديرًا.'
		}
	}
} satisfies Translation['settings'];

export const settingsHooks = {
	endingSoonUpdated: 'تم تحديث فترة الإشعار!',
	workspaceUpToDate: 'كل شيء محدّث.'
} satisfies Translation['settingsHooks'];

// the update's controls and the labels of its block, which the settings' general tab draws
// (`component/updates.svelte`), and the retry of a settings read that failed, composed back at
// `common.actions` and `common.labels`.
export const common = {
	actions: {
		checkForUpdates: 'التحقق من التحديثات',
		downloadAndInstall: 'تنزيل وتثبيت',
		installingUpdate: 'جاري تثبيت التحديث...',
		checkingForUpdates: 'جاري التحقق من التحديثات...',
		restartApp: 'إعادة تشغيل التطبيق',
		retry: 'إعادة المحاولة'
	},
	labels: {
		releaseNotes: 'ملاحظات الإصدار',
		availableVersion: 'الإصدار المتاح',
		currentVersion: 'الإصدار الحالي',
		releaseDate: 'تاريخ الإصدار'
	}
} satisfies {
	actions: Pick<
		Translation['common']['actions'],
		| 'checkForUpdates'
		| 'downloadAndInstall'
		| 'installingUpdate'
		| 'checkingForUpdates'
		| 'restartApp'
		| 'retry'
	>;
	labels: Pick<
		Translation['common']['labels'],
		'releaseNotes' | 'availableVersion' | 'currentVersion' | 'releaseDate'
	>;
};
