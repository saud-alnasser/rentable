import type { Translation } from '../i18n-types';

const ar = {
	app: {
		name: 'rentable'
	},
	common: {
		actions: {
			actions: 'الإجراءات',
			assignSelected: 'تعيين المحدد',
			assigning: 'جاري التعيين...',
			cancel: 'إلغاء',
			checkForUpdates: 'التحقق من التحديثات',
			checkingForUpdates: 'جاري التحقق من التحديثات...',
			connect: 'ربط',
			connecting: 'جارٍ الربط...',
			create: 'إنشاء',
			createBackup: 'إنشاء نسخة احتياطية',
			creating: 'جاري الإنشاء...',
			creatingBackup: 'جاري إنشاء نسخة احتياطية...',
			customizeColumns: 'تخصيص الأعمدة',
			delete: 'حذف',
			deleting: 'جاري الحذف...',
			disconnect: 'فصل',
			downloadAndInstall: 'تنزيل وتثبيت',
			edit: 'تعديل',
			installingUpdate: 'جاري تثبيت التحديث...',
			link: 'ربط',
			linking: 'جارٍ الربط...',
			newRecord: 'سجل جديد',
			openLocal: 'فتح مساحة العمل محليًا',
			openMenu: 'فتح القائمة',
			openPayments: 'فتح المدفوعات',
			openPreviousRelease: 'فتح الإصدار السابق',
			proceed: 'متابعة',
			pull: 'سحب البعيد',
			pulling: 'جارٍ السحب...',
			push: 'رفع اللقطة',
			pushing: 'جارٍ الرفع...',
			remove: 'إزالة',
			restore: 'استعادة',
			restoring: 'جاري الاستعادة...',
			restartApp: 'إعادة تشغيل التطبيق',
			retry: 'إعادة المحاولة',
			retryStartup: 'إعادة محاولة التشغيل',
			rollback: 'التراجع',
			rollingBack: 'جاري التراجع...',
			save: 'حفظ',
			saveDatabasePath: 'حفظ مسار قاعدة البيانات',
			saveWindow: 'حفظ النافذة',
			saving: 'جاري الحفظ...',
			sortBy: 'ترتيب حسب',
			syncing: 'جارٍ المزامنة...',
			syncNow: 'زامن الآن',
			unlink: 'إلغاء الربط',
			terminate: 'إنهاء',
			terminating: 'جاري الإنهاء...',
			unterminate: 'إلغاء الإنهاء',
			update: 'تحديث',
			useDefaultPath: 'استخدام المسار الافتراضي',
			working: 'جاري العمل...'
		},

		errors: {
			busy: 'هناك عملية أخرى قيد التنفيذ بالفعل.',
			cancelled: 'تم إلغاء العملية.',
			credential: 'تعذر استخدام بيانات الاعتماد المحفوظة.',
			database: 'تعذر على قاعدة البيانات إكمال الطلب.',
			forbidden: 'هذا الإجراء غير مسموح به.',
			integrity: 'البيانات لا تطابق ما هو متوقع.',
			internal: 'حدث خطأ ما داخل التطبيق.',
			invalidInput: 'المعلومات المدخلة غير صالحة.',
			io: 'تعذرت قراءة ملف أو الكتابة إليه.',
			network: 'تعذر على التطبيق الاتصال بالإنترنت. تحقق من اتصالك وحاول مرة أخرى.',
			notConfigured: 'لم يتم إعداد هذه الميزة بعد.',
			notFound: 'تعذر العثور على العنصر.',
			preconditionFailed: 'يجب تجهيز شيء ما قبل تنفيذ هذا الإجراء.',
			timedOut: 'استغرقت العملية وقتاً طويلاً وتوقفت.'
		},

		labels: {
			action: 'إجراء',
			activeContracts: 'العقود السارية',
			amount: 'المبلغ',
			appVersion: 'إصدار التطبيق',
			availableVersion: 'الإصدار المتاح',
			backupCount: 'عدد النسخ الاحتياطية',
			complex: 'مجمع',
			contract: 'عقد',
			contractEnds: 'ينتهي العقد',
			contractNumber: 'رقم العقد',
			contractPeriod: 'مدة العقد',
			costPerPayment: 'التكلفة لكل دفعة',
			currentDatabasePath: 'مسار قاعدة البيانات الحالي',
			currentValue: 'القيمة الحالية',
			currentVersion: 'الإصدار الحالي',
			customDatabasePathOverride: 'تجاوز مسار قاعدة البيانات',
			cycle: 'الدورة',
			defaultDatabasePath: 'مسار قاعدة البيانات الافتراضي',
			dueBalance: 'الرصيد المستحق',
			dueBalanceCoveredToDate: 'الرصيد المغطى حتى الآن',
			end: 'النهاية',
			governmentId: 'المعرف الحكومي',
			information: 'المعلومات',
			governmentIdOptional: 'المعرف الحكومي (اختياري)',
			lastBackupTime: 'آخر وقت نسخة احتياطية',
			lastSyncTime: 'آخر وقت مزامنة',
			location: 'الموقع',
			name: 'الاسم',
			nationalId: 'الهوية الوطنية',
			noticeWindowDays: 'فترة الإشعار (أيام)',
			payment: 'دفعة',
			paymentDate: 'تاريخ الدفع',
			paymentFulfillment: 'تحقق الدفع',
			phone: 'الهاتف',
			releaseDate: 'تاريخ الإصدار',
			releaseNotes: 'ملاحظات الإصدار',
			remainingDueBalance: 'الرصيد المتبقي',
			start: 'البداية',
			status: 'الحالة',
			tenant: 'المستأجر',
			unit: 'وحدة',
			units: 'وحدات',
			vacantUnits: 'وحدات شاغرة'
		},

		messages: {
			loadingApp: 'جاري تحميل التطبيق...',
			loadingComplexes: 'جاري تحميل المجمعات...',
			loadingSettings: 'جاري تحميل الإعدادات...',
			never: 'أبدًا',
			noResults: 'لا توجد نتائج.',
			sar: 'ريال',
			unexpectedError: 'حدث خطأ غير متوقع!',
			unknown: 'غير معروف'
		},

		nav: {
			complexes: 'المجمعات',
			contracts: 'العقود',
			dashboard: 'لوحة التحكم',
			payments: 'المدفوعات',
			primary: 'الرئيسي',
			settings: 'الإعدادات',
			tenants: 'المستأجرون',
			units: 'الوحدات'
		},

		status: {
			active: 'نشط',
			defaulted: 'متعثر',
			expired: 'منتهي',
			fulfilled: 'مكتمل',
			occupied: 'مشغول',
			overdue: 'متأخر',
			scheduled: 'مجدول',
			terminated: 'منتهي',
			vacant: 'شاغر'
		},

		statusDescriptions: {
			active: 'نشط؛ المدفوعات منتظمة',
			defaulted: 'منتهي؛ غير مدفوع بالكامل',
			expired: 'منتهي؛ مدفوع بالكامل',
			fulfilled: 'نشط؛ مدفوع بالكامل',
			occupied: 'مشغولة بعقد سارٍ اليوم',
			overdue: 'انتهت مدته وما زال عليه مستحق',
			scheduled: 'مجدول؛ يبدأ لاحقاً',
			terminated: 'تم إنهاؤه يدوياً',
			vacant: 'لا يشغلها أي عقد اليوم'
		},

		table: {
			goToFirstPage: 'اذهب للصفحة الأولى',
			goToLastPage: 'اذهب للصفحة الأخيرة',
			goToNextPage: 'اذهب للصفحة التالية',
			goToPreviousPage: 'اذهب للصفحة السابقة',
			pageOf: 'الصفحة {page} من {count}',
			results: '{count|number} نتيجة',
			rowsPerPage: 'عدد الصفوف لكل صفحة',
			rowsSelected: '{selected} من {total} صف محدد.',
			searchPlaceholder: 'بحث...'
		},

		time: {
			day: '{count} يوم',
			days: '{count} أيام'
		},

		window: {
			close: 'إغلاق النافذة',
			minimize: 'تصغير النافذة',
			toggleMaximize: 'تبديل تكبير النافذة'
		},

		ui: {
			breadcrumb: 'مسار التنقل',
			close: 'إغلاق',
			commandPalette: 'لوحة الأوامر',
			commandPaletteDescription: 'ابحث عن أمر للتنفيذ',
			commandPaletteEmpty: 'لا توجد نتائج مطابقة',
			commandPaletteGoTo: 'الانتقال إلى',
			loading: 'جاري التحميل',
			mobileSidebarDescription: 'يعرض الشريط الجانبي للهاتف.',
			more: 'المزيد',
			morePages: 'صفحات أكثر',
			next: 'التالي',
			nextSlide: 'الشريحة التالية',
			pagination: 'ترقيم الصفحات',
			previous: 'السابق',
			previousSlide: 'الشريحة السابقة',
			search: 'بحث',
			sidebar: 'الشريط الجانبي',
			toggleSidebar: 'تبديل الشريط الجانبي'
		},

		deleteDialog: {
			description: 'هل أنت متأكد أنك تريد حذف هذا السجل؟',
			title: 'تأكيد'
		}
	},
	layout: {
		error: {
			description: 'حدث خطأ في هذه الشاشة. العودة إلى لوحة التحكم تحل المشكلة عادة.',
			goHome: 'الذهاب إلى لوحة التحكم',
			title: 'تعذر عرض هذه الشاشة'
		},

		startup: {
			accountChoiceDescription:
				'افتح مساحة العمل الحالية محليًا، أو اربط Google Drive الآن لتحويلها إلى مساحة عمل متزامنة.',
			accountChoiceEmpty: 'لا توجد ملفات عمل متاحة بعد.',
			accountChoiceTitle: 'افتح مساحة العمل الحالية',
			failedToStartDescription: 'حدثت مشكلة أثناء الاتصال بقاعدة البيانات أو تشغيل مزامنة البدء.',
			failedToStartFallback: 'فشل في تشغيل التطبيق.',
			failedToStartTitle: 'فشل في تشغيل التطبيق',
			previousVersion: 'الإصدار السابق',
			recoveryDescription:
				'اكتشف rentable حالة استرداد تحديث أثناء تشغيل الإصدار v{version}. أعد محاولة التشغيل أو افتح الإصدار السابق إذا كنت بحاجة إلى إعادة تثبيته.',
			recoveryDetails:
				'تم إنشاء النسخة الاحتياطية المحمية من الإصدار v{backupVersion}. إذا استمر فشل التشغيل، فأعد تثبيت الإصدار السابق قبل فتح rentable مرة أخرى.',
			recoveryRequiredTitle: 'مطلوب استرداد التحديث',
			recoverySnapshotNotUpdated: 'تم التراجع ولكن لم يتم تحديث لقطة الاسترداد.',
			restoredBackup: 'تمت استعادة النسخة الاحتياطية',
			rolledBackDescription:
				'تمت استعادة النسخة الاحتياطية المحمية وتم قفل التطبيق حتى إعادة تثبيت الإصدار السابق.',
			rolledBackDetails: 'افتح إصدار github السابق، أعد تثبيته، ثم شغل rentable مرة أخرى.',
			rolledBackTitle: 'تم التراجع عن التحديث',
			startupRecoveryBackup: 'نسخة احتياطية'
		}
	},

	dashboard: {
		empty: {
			description: 'لا يوجد متأخر ولا متعثر ولا عقد ينتهي خلال فترة الإشعار.',
			title: 'لا شيء يحتاج إلى إجراء اليوم.'
		},

		queue: {
			alsoEnding: 'ينتهي أيضاً',
			collectedThisMonth: 'المحصل هذا الشهر',
			groupCount: '{count|number} عقد',
			groups: {
				endingSoon: 'قريب الانتهاء',
				overdue: 'متأخر',
				owing: 'مستحق'
			},
			occupancy: '{occupied} / {total}',
			occupiedUnits: 'الوحدات المشغولة',
			openContract: 'افتح عقد {tenant}'
		},

		title: 'لوحة التحكم'
	},

	settings: {
		aboutDescription: 'معلومات التطبيق الحالية ووقت آخر مزامنة وآخر لقطة استرداد.',
		aboutTitle: 'حول',
		createdAt: 'تم الإنشاء {value}',

		createBackupDescription:
			'تُحفظ النسخ الاحتياطية في مجلد نسخ التطبيق، ويمكن استعادتها من الأسفل. كما تُنشأ نسخة احتياطية محمية تلقائياً قبل تشغيل أي ترحيل.',
		createBackupTitle: 'إنشاء نسخة احتياطية',

		databaseDescription:
			'بدّل قاعدة البيانات النشطة، أو ارجع إلى المسار الافتراضي، أو أنشئ نسخاً احتياطية، أو استعد نسخاً سابقة.',
		databaseTitle: 'مسار قاعدة البيانات والنسخ الاحتياطية',

		deleteBackupDescription: 'هل أنت متأكد أنك تريد حذف هذه النسخة؟ لا يمكن التراجع.',
		deleteBackupNamedDescription: 'هل أنت متأكد أنك تريد حذف "{name}"؟ لا يمكن التراجع.',
		deleteBackupTitle: 'حذف نسخة احتياطية',

		description:
			'أدر فترة الإشعار قبل الانتهاء، وتحديثات التطبيق، وملفات عمل المزامنة، ومعلومات التطبيق.',

		diagnosticsDescription:
			'يسجل رينتابل ما يجري على هذا الجهاز — بدء التشغيل والترحيلات والنسخ الاحتياطية والمزامنة — ليمكن تتبع أي عطل بعد وقوعه. لا تغادر الملفات هذا الجهاز وحجمها محدود، وتُحذف كلمات المرور ورموز الحسابات قبل كتابة أي شيء.',
		diagnosticsLocationLabel: 'موقع السجل',
		diagnosticsReveal: 'فتح مجلد السجل',
		diagnosticsTitle: 'التشخيص',

		downloadingUpdate: 'جاري تنزيل التحديث',

		endingSoonDescription:
			'حدد عدد الأيام قبل نهاية العقد ليظهر في لوحة التحكم ضمن العقود القريبة من الانتهاء.',
		endingSoonInvalid: 'يجب أن تكون فترة الإشعار أكبر من صفر',
		endingSoonTitle: 'فترة الإشعار قبل الانتهاء',

		latestRelease: 'أنت تستخدم أحدث إصدار.',

		loadErrorDescription: 'حدثت مشكلة أثناء تحميل الإعدادات.',
		loadErrorTitle: 'الإعدادات غير متاحة حالياً',
		currentWorkspace: 'مساحة العمل الحالية',
		openWorkspaceAction: 'فتح مساحة العمل',

		protectedUpdateBackup: 'نسخة احتياطية محمية',
		releaseAvailable: 'يتوفر تحديث v{version}.',
		restoreBackupTitle: 'استعادة نسخة احتياطية',

		restartNotice:
			'تم تثبيت التحديث. قد يتم إغلاق التطبيق تلقائياً أثناء التثبيت، أو أعد تشغيله لإكمال التحديث.',

		noBackups: 'لا توجد نسخ احتياطية بعد.',

		pathOverrideDescription:
			'عند تركه فارغاً سيُستخدم المسار الافتراضي أعلاه. عند الحفظ يُعاد الاتصال فوراً، وتُشغَّل الترحيلات مجدداً عند بدء التشغيل على مسار قاعدة البيانات المحدد.',
		pathOverridePlaceholder: 'اتركه فارغاً لاستخدام المسار الافتراضي',
		latestSnapshot: 'أحدث لقطة',
		snapshotNow: 'إنشاء لقطة الآن',
		syncAutomationDescription:
			'تُدار اللقطات تلقائياً للاسترداد والمزامنة والتنظيف عند إلغاء الربط، وتُنظَّف اللقطات الداخلية الأقدم نيابةً عنك.',
		syncAutomationTitle: 'لقطات مُدارة',
		syncAccountsDescription:
			'تظل حسابات Google Drive المرتبطة متاحة للتبديل بين مساحات العمل والمزامنة والاختيار عند بدء التشغيل.',
		syncAccountsTitle: 'حسابات Google Drive المرتبطة',
		syncAccountStatusNeedsReconnect: 'يحتاج إلى إعادة ربط',
		syncAccountStatusPending: 'بانتظار التفويض',
		syncAccountStatusReady: 'جاهز للمزامنة',
		syncAppDriveUsageDescription: 'مساحة Rentable Sync المستخدمة: {value}',
		syncConnectedAccountLabel: 'Google Drive المرتبط',
		syncConflictDeferAction: 'افتح الآن بدون مزامنة',
		syncCorruptDescription:
			'تعذّر قراءة بيانات Google Drive الوصفية بأمان. أصلح مساحة العمل البعيدة باستخدام مساحة العمل المحلية الحالية قبل متابعة المزامنة.',
		syncCorruptKeepLocalAction: 'إصلاح البعيد باستخدام المحلي',
		syncCorruptLocalDescription:
			'استخدم هذا الجهاز كمصدر أساسي واكتب ملف manifest نظيفاً مرة أخرى إلى Google Drive.',
		syncCorruptRemoteDescription:
			'بيانات Google Drive الوصفية المرتبطة بالحساب {email} تالفة، لذلك لا يمكن الوثوق بالنسخة البعيدة حتى يتم إصلاحها.',
		syncCorruptShortDescription:
			'بيانات Google Drive الوصفية تالفة. أصلح مساحة العمل البعيدة باستخدام نسختك المحلية قبل متابعة المزامنة.',
		syncCorruptTitle: 'إصلاح بيانات Google Drive الوصفية',
		syncAlreadyRunningDescription:
			'توجد مزامنة Google Drive أخرى قيد التشغيل بالفعل. انتظر حتى تنتهي ثم أعد المحاولة.',
		syncConflictDescription:
			'تغيّرت مساحة العمل هذه محلياً وعلى Google Drive منذ آخر مزامنة. اختر النسخة التي يجب أن تستمر قبل المزامنة مرة أخرى.',
		syncConflictLatestBadge: 'الأحدث',
		syncConflictKeepLocalAction: 'الاحتفاظ بالمحلي ومزامنته',
		syncConflictLocalDescription:
			'اجعل هذا الجهاز هو المصدر الأساسي واكتب مساحة العمل المحلية فوق لقطة Google Drive الحالية.',
		syncConflictRemoteDescription: 'استبدل هذا الجهاز بلقطة Google Drive المرتبطة بالحساب {email}.',
		syncConflictShortDescription:
			'حدث تباعد بين المساحة المحلية والبعيدة. اختر أي الجانبين يجب أن يعتمد قبل استئناف المزامنة.',
		syncConflictTitle: 'حل تعارض المزامنة',
		syncConflictUseRemoteAction: 'استخدام البعيد ومزامنته',
		syncDescription:
			'راجع حالة مساحة العمل الحالية، واحتفظ بلقطة حديثة، واربط أو ألغِ ربط مزامنة Google Drive.',
		syncGoogleDrivePending:
			'ربط حسابات Google Drive غير مفعّل في هذا الإصدار بعد، لكن أساس ملفات العمل واللقطات أصبح جاهزاً له.',
		syncTotalDriveUsageDescription: 'إجمالي مساحة Google Drive المستخدمة: {value}',
		syncLinkConflictDescription:
			'تحتوي مساحة العمل هذه بالفعل على لقطة محلية ولقطة على Google Drive. اختر النسخة التي يجب أن تستمر قبل بدء المزامنة.',
		syncLinkConflictLocalDescription:
			'تابع باستخدام هذا الجهاز واكتب أحدث لقطة محلية فوق Google Drive.',
		syncLinkConflictLocalTitle: 'الاحتفاظ بالمحلي',
		syncLinkConflictRemoteDescription:
			'استبدل هذا الجهاز بلقطة Google Drive المرتبطة بالحساب {email}.',
		syncLinkConflictRemoteTitle: 'استخدام البعيد',
		syncLinkConflictShortDescription:
			'أكمل الربط باختيار ما إذا كانت اللقطة المحلية أو البعيدة ستصبح مساحة العمل المتزامنة.',
		syncLinkConflictTitle: 'اختر نسخة مساحة العمل التي ستبقى',
		syncLinkKeepLocalAction: 'الاحتفاظ بالمحلي وربطه',
		syncLinkUseRemoteAction: 'استخدام البعيد وربطه',
		syncLastRemoteDescription: 'آخر تحديث بعيد {value}',
		syncLastSnapshotDescription: 'أحدث لقطة {value}',
		syncLinkDescription:
			'اربط Google Drive بمساحة العمل هذه لتفعيل المزامنة عند بدء التشغيل والاسترداد البعيد. إذا وُجدت لقطات محلية وبعيدة معًا فستختار أيهما يبقى.',
		syncLinkFinalizingDescription:
			'تم استلام تفويض Google. يُنهي Rentable الآن ربط Google Drive ويتحقق من مساحة العمل البعيدة.',
		syncLinkFinalizingTitle: 'جارٍ إنهاء ربط Google Drive',
		syncLinkPendingDescription:
			'أكمل تسجيل الدخول إلى Google في المتصفح. إذا كانت هناك لقطة موجودة بالفعل على Google Drive لهذه المساحة فستختار المحلي أو البعيد بعد ذلك.',
		syncLinkPendingTitle: 'بانتظار تفويض Google',
		syncLinkTimedOutDescription:
			'استغرق تفويض Google Drive وقتاً طويلاً ولم يكتمل. ابدأ الربط مرة أخرى عندما تكون جاهزاً.',
		syncNotLinkedDescription: 'مساحة العمل الحالية غير مرتبطة بـ Google Drive.',
		syncNoLinkedAccounts: 'لا توجد حسابات Google Drive مرتبطة بعد.',
		syncProfilesDescription:
			'كل مساحة عمل تحتفظ بمسار قاعدة بياناتها المحلي وآخر لقطة استرداد لها.',
		syncProfilesTitle: 'ملفات العمل',
		syncProviderGoogleDrive: 'Google Drive',
		syncProviderLocal: 'مساحة عمل محلية',
		syncReconnectDescription: 'انتهت صلاحية تفويض Google Drive. يُرجى إعادة ربط الحساب.',
		syncRelinkRequiredAction: 'تصفير البعيد وإعادة الربط',
		syncRelinkRequiredDescription:
			'مساحة عمل Google Drive المرتبطة فقدت ملف manifest، ولا يمكن الوثوق باللقطات البعيدة المتبقية بصيغتها الحالية. للمتابعة بأمان، صفّر النسخة البعيدة المعطوبة ثم أعد ربط Google Drive من جديد. سيؤدي ذلك إلى مسح ملفات اللقطات البعيدة الحالية قبل إعادة الربط.',
		syncRelinkRequiredLocalDescription:
			'احتفظ بمساحة العمل المحلية الحالية على هذا الجهاز، وامسح النسخة البعيدة المعطوبة، ثم ابدأ ربط Google Drive من جديد.',
		syncRelinkRequiredRemoteDescription:
			'لا يمكن تحويل ملفات اللقطات المتبقية على Google Drive للحساب {email} إلى ملف manifest بعيد صالح بشكل آمن تلقائياً.',
		syncRelinkRequiredShortDescription:
			'النسخة المرتبطة على Google Drive معطوبة ويجب إعادة ربطها قبل متابعة المزامنة.',
		syncRelinkRequiredTitle: 'أعد ربط مساحة عمل Google Drive المعطوبة',
		syncRemoteStateChangedDescription:
			'تغيّر Google Drive أثناء المزامنة. أعد المحاولة باستخدام أحدث حالة بعيدة.',
		syncRemoteSnapshotUnavailableDescription:
			'لا توجد لقطة بعيدة متاحة بعد على Google Drive لمساحة العمل هذه.',
		syncUnlinkDescription:
			'يبقي إلغاء الربط مساحة العمل هذه محلية، وينشئ لقطة محلية حديثة واحدة، ويوقف مزامنة Google Drive المستقبلية حتى تعيد الربط من جديد.',
		syncUnlinkDialogDescription:
			'سيُبقي هذا مساحة العمل محلية ويوقف مزامنة Google Drive المستقبلية حتى تعيد الربط من جديد.',
		syncUnlinkDialogTitle: 'إلغاء ربط Google Drive؟',
		syncWorkspaceChangedDescription:
			'تغيّرت مساحة العمل النشطة قبل أن تتمكن مزامنة Google Drive من البدء.',
		syncWorkspaceStatusSynced: 'تمت مزامنته',
		syncTitle: 'المزامنة وملفات العمل',

		localeDescription: 'اختر لغة العرض المفضلة لديك. سيتم تحديث الواجهة فوراً.',
		localeLabel: 'لغة العرض',
		localeTitle: 'اللغة',

		title: 'الإعدادات',

		updatesChecking: 'جارٍ التحقق من التحديثات...',
		updatesDescription:
			'تحقق من إصدارات github بحثاً عن إصدار أحدث موقّع. وإذا فشل التشغيل بعد التحديث، فسيوفر rentable خيار التراجع إلى النسخة الاحتياطية المحمية السابقة للتحديث.',
		updatesTitle: 'تحديثات التطبيق',

		usingCustomDatabasePath: 'يتم استخدام مسار قاعدة بيانات مخصص.',
		usingDefaultDatabasePath: 'يتم استخدام المسار الافتراضي.'
	},
	complexes: {
		hooks: {
			createSuccess: 'تم إنشاء المجمع بنجاح!',
			deleteSuccess: 'تم حذف المجمع بنجاح!',
			unitCreateSuccess: 'تم إنشاء الوحدة بنجاح!',
			unitDeleteSuccess: 'تم حذف الوحدة بنجاح!',
			unitUpdateSuccess: 'تم تحديث الوحدة بنجاح!',
			updateSuccess: 'تم تحديث المجمع بنجاح!'
		},

		form: {
			duplicateName: 'الاسم مرتبط بمجمع مسجل مسبقاً.'
		},

		units: {
			contractsEmptyDescription: 'ستظهر هنا العقود التي تذكر هذه الوحدة.',
			contractsEmptyTitle: 'لا توجد عقود تذكر هذه الوحدة',
			duplicateName: 'الاسم مرتبط بوحدة في نفس المجمع.',
			management: 'إدارة الوحدات'
		}
	},

	tenants: {
		contracts: {
			emptyTitle: 'لا توجد عقود بعد',
			emptyDescription: 'ستظهر هنا العقود التي يحملها هذا المستأجر.'
		},

		hooks: {
			createSuccess: 'تم إنشاء المستأجر بنجاح!',
			deleteSuccess: 'تم حذف المستأجر بنجاح!',
			updateSuccess: 'تم تحديث المستأجر بنجاح!'
		},

		form: {
			phoneCountryCode: 'مفتاح الدولة',
			duplicateNationalId: 'رقم الهوية مرتبط بمستأجر مسجل.',
			duplicatePhone: 'رقم الهاتف مرتبط بمستأجر مسجل.',
			invalidNationalId: 'يجب أن يبدأ رقم الهوية الوطنية بـ 1 أو 2 ويتكون من 10 أرقام.',
			invalidPhone: 'يجب أن يكون رقم الهاتف صالحاً لمفتاح الدولة المحدد {countryCode}.',
			phoneNumberPlaceholder: '5xxxxxxxx',
			phonePlaceholder: 'الهاتف (+966...)'
		}
	},

	contracts: {
		form: {
			startDate: 'تاريخ البداية',
			calculatedEndDate: 'تاريخ النهاية المحسوب',
			calculatedEndDateHint:
				'يتم تحديثه تلقائياً حسب الدورة وتاريخ البداية وعدد الدورات. يمكنك تعديله يدوياً ضمن {days} أيام قبل أو بعد تاريخ النهاية المقترح؛ والتواريخ المسموح بها مميزة باللون الأخضر.',
			costDecimalPlaces: 'تقبل التكلفة منزلتين عشريتين كحد أقصى.',
			costGreaterThanZero: 'يجب أن تكون التكلفة أكبر من صفر.',
			costPerPaymentGreaterThanZero: 'يجب أن تكون تكلفة الدفعة أكبر من صفر.',
			costRequired: 'التكلفة مطلوبة.',
			cyclesGreaterThanZero: 'يجب أن يكون عدد الدورات أكبر من صفر.',
			cyclesRequired: 'عدد الدورات مطلوب.',
			duplicateGovernmentId: 'رقم الهوية مرتبط بعقد آخر.',
			endDateAfterStart: 'يجب أن يكون تاريخ النهاية بعد البداية.',
			endDateRequired: 'تاريخ النهاية مطلوب.',
			endDateShort: 'تاريخ النهاية',
			invalidTenant: 'يرجى اختيار مستأجر صالح.',
			loadingTenant: 'جاري تحميل المستأجر...',
			loadingTenants: 'جاري تحميل المستأجرين...',
			noTenantFound: 'لم يتم العثور على مستأجر.',
			numberOfCycles: 'عدد الدورات',
			totalExpectedAmount: 'إجمالي المبلغ المتوقع',
			paymentAmountDecimalPlaces: 'يقبل مبلغ الدفع منزلتين عشريتين كحد أقصى',
			paymentAmountGreaterThanZero: 'يجب أن يكون مبلغ الدفع أكبر من صفر',
			paymentAmountRequired: 'مبلغ الدفع مطلوب',
			paymentDateRequired: 'تاريخ الدفع مطلوب',
			pickDate: 'اختر تاريخ',
			pickDateRange: 'اختر نطاق تاريخ',
			periodMustMatchWholeCycles:
				'يجب أن يبقى تاريخ النهاية ضمن {days} أيام قبل أو بعد تاريخ نهاية دورة {interval} المحسوب.',
			searchAndSelectTenant: 'ابحث واختر مستأجر',
			searchTenantPlaceholder: 'ابحث عن مستأجر بالاسم أو الهوية أو الهاتف...',
			startDateRequired: 'تاريخ البداية مطلوب.',
			tenantRequired: 'المستأجر مطلوب.'
		},

		hooks: {
			assignUnitsSuccess: 'تمت إضافة الوحدات للعقد بنجاح!',
			createPaymentSuccess: 'تم إنشاء الدفعة بنجاح!',
			createSuccess: 'تم إنشاء العقد بنجاح!',
			deletePaymentSuccess: 'تم حذف الدفعة بنجاح!',
			deleteSuccess: 'تم حذف العقد بنجاح!',
			removeUnitSuccess: 'تمت إزالة الوحدة من العقد!',
			restoreSuccess: 'تمت استعادة العقد بنجاح!',
			terminateSuccess: 'تم إنهاء العقد بنجاح!',
			updatePaymentSuccess: 'تم تحديث الدفعة بنجاح!',
			updateSuccess: 'تم تحديث العقد بنجاح!'
		},

		intervals: {
			annual: 'سنوي',
			monthly: 'شهري',
			quarterly: 'ربع سنوي',
			semiAnnual: 'نصف سنوي'
		},

		payments: {
			fullyPaidNotice:
				'تم الوصول إلى إجمالي المبلغ المطلوب. يمكنك التعديل أو الحذف لكن لا يمكن إضافة دفعات جديدة.',
			fullyPaidSummary: 'تم سداد العقد بالكامل.',
			monthTotal: 'الإجمالي المعروض في {month}',
			percentFulfilled: '{percent}% مكتمل',
			remaining: 'متبقي {amount} ريال',
			remainingAfter: 'المتبقي بعد هذه الدفعة',
			remainingBalance: 'الرصيد المتبقي',
			terminatedNotice: 'العقود المنتهية مقفلة ولا يمكن تعديل المدفوعات.',
			terminatedSummary: 'العقد منتهي والمدفوعات للقراءة فقط.',
			title: 'المدفوعات',
			titleFor: 'مدفوعات {govId}',
			trackSummary: 'تتبع المدفوعات وإضافة دفعات جديدة.'
		},

		table: {
			paymentsManagement: 'إدارة المدفوعات',
			restoreDescription: 'هل تريد إزالة إنهاء العقد؟',
			restoreTitle: 'استعادة العقد',
			terminateDescription: 'هل تريد إنهاء العقد يدوياً؟',
			terminateTitle: 'إنهاء العقد',
			tenantFallback: 'مستأجر #{tenantId}',
			unitsManagement: 'إدارة الوحدات'
		},

		units: {
			availableDescription: 'اختر مجمعاً لعرض الوحدات المتاحة.',

			lockNoticeHasPayments: 'لا يمكن تعديل الوحدات بعد تسجيل مدفوعات.',
			lockNoticeTerminated: 'العقد منتهي ولا يمكن تعديل الوحدات.',

			noAssignedUnits: 'لا توجد وحدات مرتبطة.',
			noAvailableUnits: 'لا توجد وحدات متاحة.',

			assignTitle: 'إسناد وحدات',

			removeDescription: 'هل تريد إزالة هذه الوحدة من العقد؟',
			removeTitle: 'إزالة وحدة',

			selectComplex: 'اختر مجمع',
			selectComplexPlaceholder: 'اختر مجمع',
			selectUnits: 'اختر وحدة واحدة على الأقل.'
		}
	},

	settingsHooks: {
		backupCreated: 'تم إنشاء النسخة الاحتياطية!',
		backupDeleted: 'تم حذف النسخة الاحتياطية!',
		backupRestored: 'تمت استعادة النسخة الاحتياطية!',
		databasePathReset: 'تم إعادة تعيين المسار!',
		databasePathUpdated: 'تم تحديث المسار!',
		endingSoonUpdated: 'تم تحديث فترة الإشعار!',
		googleDriveAlreadyUpToDate: 'مساحة عمل Google Drive محدثة بالفعل!',
		googleDriveDisconnected: 'تم فصل حساب Google Drive بنجاح!',
		googleDriveLinked: 'تم ربط مساحة عمل Google Drive بنجاح!',
		googleDriveUnlinked: 'تم إلغاء ربط مساحة عمل Google Drive بنجاح!',
		googleDriveSynchronized: 'تمت مزامنة مساحة العمل مع Google Drive بنجاح!',
		profileSwitched: 'تم تبديل مساحة العمل بنجاح!',
		rollbackRestored: 'تم استعادة النسخة المحمية!',
		snapshotCreated: 'تم إنشاء اللقطة بنجاح!',
		startupRecoveryCleared: 'تم مسح الاسترداد ويمكن المحاولة مجدداً.'
	}
} satisfies Translation;

export default ar;
