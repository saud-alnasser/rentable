// The settings feature's strings in arabic, composed back into `i18n/ar/index.ts` at `settings`,
// `settingsHooks`, `common.actions` and `common.labels`. It imports nothing but types, because the
// typesafe-i18n generator transpiles it along with the locale. Each object satisfies its own slice
// of the generated types, so a key missing, left over or without its placeholder fails here.

import type { Translation } from '../../i18n/i18n-types';

export const settings = {
	diagnosticsDescription:
		'سجل بما يفعله رينتابل لتتبع الأعطال. يبقى هنا، ولا تُكتب فيه كلمات المرور ولا الرموز.',
	diagnosticsFolder: 'مجلد السجل',
	diagnosticsReveal: 'فتح مجلد السجل',
	diagnosticsTitle: 'التشخيص',

	downloadingUpdate: 'جاري تنزيل التحديث',

	latestRelease: 'أنت تستخدم أحدث إصدار.',

	loadErrorTitle: 'الإعدادات غير متاحة حالياً',

	transferImportTitle: 'استيراد إلى {workspace}',
	transferImportSuccess: 'تم استيراد الملف',

	restartNotice: 'تم تثبيت التحديث. أعد تشغيل رينتابل لإكماله.',

	preferences: {
		title: 'اللغة والمظهر',
		description: 'كيف يُقرأ رينتابل ويبدو على هذا الجهاز.'
	},
	localeTitle: 'اللغة',

	appearanceTitle: 'المظهر',
	appearanceSystemHint: 'يتبع جهازك كلما تحوّل بين الفاتح والداكن',
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

	updatesState: {
		checking: 'جارٍ التحقق',
		upToDate: 'محدّث',
		available: 'يتوفر تحديث',
		downloading: 'جارٍ التنزيل',
		restart: 'أعد التشغيل لإكماله'
	},
	whatsNew: 'ما الجديد في {version}',
	releasedOn: 'صدر في {date}',
	updatesDescription:
		'تحقق من وجود إصدار أحدث وثبّته. وإذا تعذر تشغيل التطبيق بعده، فسيعرض إعادة الإصدار السابق.',
	updatesTitle: 'التحديثات',

	// الأداة الهادئة الوحيدة أسفل كل خطوة من خطوات الدخول (الجهد 843، المتطلب 7).
	wayIn: {
		preferences: 'اللغة والمظهر'
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
			changeShort: 'غيّر',
			changed: 'تم تغيير كلمة مرورك.'
		},
		sessions: {
			action: 'سجّل الخروج من كل الأجهزة الأخرى',
			short: 'سجّل خروج الأجهزة الأخرى',
			noOthers: 'لا جهاز آخر مسجّل الدخول باسمك.',
			confirmDescription:
				'يُسجَّل خروجك من كل جهاز آخر، وتعيدك كلمة مرورك إلى كل منها. يبقى هذا الجهاز مسجل الدخول.',
			ended: 'سُجّل الخروج من أجهزتك الأخرى.',
			endedPending: 'هذا الجهاز غير متصل؛ سيصل تسجيل الخروج إلى الأجهزة الأخرى عند عودة الاتصال.'
		},
		machines: {
			title: 'الأجهزة',
			description: 'تسجيل خروج جهاز لا يغيّر كلمة مرورك.',
			signedIn: 'الأجهزة المسجّلة: {count}',
			thisMachine: 'هذا الجهاز',
			unnamed: 'جهاز أُضيف في {date}',
			lastSeen: 'آخر ظهور {moment}',
			added: 'أُضيف في {date}',
			notUpdated: 'لم يُحدَّث إلى هذا الإصدار بعد',
			menu: 'إجراءات {machine}',
			confirmTitle: 'سجّل خروج جهاز',
			confirmDescription:
				'يُسجَّل خروجه حين يصل إلى Turso في المرة القادمة، وتعيده كلمة مرورك. لا تتغير كلمة مرورك.',
			ended: 'سُجّل خروج الجهاز.',
			endedPending: 'هذا الجهاز غير متصل؛ سيصل تسجيل الخروج إلى ذلك الجهاز عند عودة الاتصال.'
		},
		ownership: {
			title: 'الملكية',
			offeredBy: 'عرضها عليك {owner}',
			consequence: 'إن قبلتها صرت المالك وصار هو مديرًا.'
		},
		thisMachine: {
			signOut: 'سجّل الخروج من هذا الجهاز'
		}
	}
} satisfies Translation['settings'];

export const settingsHooks = {
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
