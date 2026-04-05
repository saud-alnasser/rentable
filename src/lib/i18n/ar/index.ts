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
			create: 'إنشاء',
			createBackup: 'إنشاء نسخة احتياطية',
			creating: 'جاري الإنشاء...',
			creatingBackup: 'جاري إنشاء نسخة احتياطية...',
			customizeColumns: 'تخصيص الأعمدة',
			delete: 'حذف',
			deleting: 'جاري الحذف...',
			dragToReorder: 'اسحب لإعادة الترتيب',
			downloadAndInstall: 'تنزيل وتثبيت',
			edit: 'تعديل',
			installingUpdate: 'جاري تثبيت التحديث...',
			newRecord: 'سجل جديد',
			openMenu: 'فتح القائمة',
			openPayments: 'فتح المدفوعات',
			openPreviousRelease: 'فتح الإصدار السابق',
			proceed: 'متابعة',
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
			terminate: 'إنهاء',
			terminating: 'جاري الإنهاء...',
			unterminate: 'إلغاء الإنهاء',
			update: 'تحديث',
			useDefaultPath: 'استخدام المسار الافتراضي',
			working: 'جاري العمل...'
		},

		labels: {
			action: 'إجراء',
			amount: 'المبلغ',
			appVersion: 'إصدار التطبيق',
			availableVersion: 'الإصدار المتاح',
			backupCount: 'عدد النسخ الاحتياطية',
			complex: 'مجمع',
			contractEnds: 'ينتهي العقد',
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
			units: 'وحدات'
		},

		messages: {
			loadingApp: 'جاري تحميل التطبيق...',
			loadingComplexes: 'جاري تحميل المجمعات...',
			loadingDashboard: 'جاري تحميل لوحة التحكم...',
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

		table: {
			goToFirstPage: 'اذهب للصفحة الأولى',
			goToLastPage: 'اذهب للصفحة الأخيرة',
			goToNextPage: 'اذهب للصفحة التالية',
			goToPreviousPage: 'اذهب للصفحة السابقة',
			pageOf: 'الصفحة {page} من {count}',
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
			loading: 'جاري التحميل',
			mobileSidebarDescription: 'يعرض الشريط الجانبي للهاتف.',
			more: 'المزيد',
			morePages: 'صفحات أكثر',
			next: 'التالي',
			nextSlide: 'الشريحة التالية',
			pagination: 'ترقيم الصفحات',
			previous: 'السابق',
			previousSlide: 'الشريحة السابقة',
			sidebar: 'الشريط الجانبي',
			toggleSidebar: 'تبديل الشريط الجانبي'
		},

		deleteDialog: {
			description: 'هل أنت متأكد أنك تريد حذف هذا السجل؟',
			title: 'تأكيد'
		}
	},
	layout: {
		startup: {
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
		description: 'تابع حالة العقود وتقدم التحصيل ونسبة الإشغال بعد كل مزامنة.',

		endingSoon: {
			countOne: '{count} عقد قريب الانتهاء',
			countOther: '{count} عقود قريبة الانتهاء',
			description:
				'العقود النشطة والمسددة بالكامل التي تنتهي خلال فترة الإشعار المحددة {noticeWindow}.',
			empty: 'لا توجد عقود قريبة الانتهاء حالياً.',
			title: 'العقود القريبة من الانتهاء'
		},

		followUps: {
			countOne: '{count} متابعة مفتوحة',
			countOther: '{count} متابعات مفتوحة',
			description:
				'العقود التي لها مستحقات يحين موعدها حتى اليوم خلال الشهر الحالي، أو أرصدة متعثرة متأخرة ما زالت تحتاج إلى متابعة.',
			empty: 'لا توجد متابعات مطلوبة حالياً.',
			progressSummary: '{percent}% من الرصيد المستحق تم تغطيته حتى الآن',
			remaining: 'متبقي {amount} ريال',
			title: 'مدفوعات تحتاج متابعة في {monthLabel}',
			unavailable: 'بيانات لوحة التحكم غير متاحة حالياً.'
		},

		lastSynchronized: 'آخر مزامنة {value}',

		sections: {
			contracts: {
				description:
					'حالة عقود المحفظة الحالية، بما في ذلك العقود القريبة من الانتهاء وفق فترة الإشعار المحددة {noticeWindow}.',
				heroHint: '{active} نشط • {endingSoon} ينتهي خلال {noticeWindow}',
				heroLabel: 'حجم المحفظة الحالي',
				title: 'العقود'
			},

			money: {
				description:
					'المستحقات المجدولة لشهر {monthLabel}، والمبالغ المحصلة هذا الشهر، وأرصدة العقود الإجمالية.',
				heroHint: '{rate}% من مستحقات {monthLabel} تم تغطيتها',
				heroLabel: 'المتبقي حالياً',
				title: 'المال'
			},

			occupancy: {
				description: 'حالة إشغال الوحدات المخزنة بعد مزامنة لوحة التحكم.',
				heroHint: '{occupied} مشغول من {total} وحدة',
				heroLabel: 'نسبة الإشغال',
				title: 'الإشغال'
			}
		},

		stats: {
			activeEndingWithin: '{active} نشط • {endingSoon} ينتهي خلال {noticeWindow}',
			dueThisMonth: 'مستحق هذا الشهر',
			occupancyRate: 'نسبة الإشغال',
			overallCollectionRate: 'نسبة التحصيل العامة',
			occupiedUnits: 'الوحدات المشغولة',
			receivedThisMonth: 'المستلم هذا الشهر',
			stillDueThisMonth: 'المتبقي هذا الشهر',
			totalExpectedAmount: 'إجمالي المبلغ المتوقع',
			totalUnits: 'إجمالي الوحدات',
			vacancyRate: 'نسبة الشواغر',
			vacantUnits: 'الوحدات الشاغرة'
		},

		title: 'لوحة التحكم'
	},

	settings: {
		aboutDescription: 'معلومات التطبيق الحالية ووقت آخر مزامنة وآخر نسخة احتياطية.',
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
			'أدر فترة الإشعار قبل الانتهاء، وتحديثات التطبيق، ومسارات قواعد البيانات، والنسخ الاحتياطية، ومعلومات التطبيق.',

		downloadingUpdate: 'جاري تنزيل التحديث',

		endingSoonDescription:
			'حدد عدد الأيام قبل نهاية العقد ليظهر في لوحة التحكم ضمن العقود القريبة من الانتهاء.',
		endingSoonInvalid: 'يجب أن تكون فترة الإشعار أكبر من صفر',
		endingSoonTitle: 'فترة الإشعار قبل الانتهاء',

		latestRelease: 'أنت تستخدم أحدث إصدار.',

		loadErrorDescription: 'حدثت مشكلة أثناء تحميل الإعدادات.',
		loadErrorTitle: 'الإعدادات غير متاحة حالياً',

		protectedUpdateBackup: 'نسخة احتياطية محمية',
		releaseAvailable: 'يتوفر تحديث v{version}.',
		restoreBackupTitle: 'استعادة نسخة احتياطية',

		restartNotice:
			'تم تثبيت التحديث. قد يتم إغلاق التطبيق تلقائياً أثناء التثبيت، أو أعد تشغيله لإكمال التحديث.',

		noBackups: 'لا توجد نسخ احتياطية بعد.',

		pathOverrideDescription:
			'عند تركه فارغاً سيُستخدم المسار الافتراضي أعلاه. عند الحفظ يُعاد الاتصال فوراً، وتُشغَّل الترحيلات مجدداً عند بدء التشغيل على مسار قاعدة البيانات المحدد.',
		pathOverridePlaceholder: 'اتركه فارغاً لاستخدام المسار الافتراضي',

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
			duplicateName: 'الاسم مرتبط بوحدة في نفس المجمع.',
			management: 'إدارة الوحدات'
		}
	},

	tenants: {
		hooks: {
			createSuccess: 'تم إنشاء المستأجر بنجاح!',
			deleteSuccess: 'تم حذف المستأجر بنجاح!',
			updateSuccess: 'تم تحديث المستأجر بنجاح!'
		},

		form: {
			phoneCountryCode: 'مفتاح الدولة',
			duplicateNationalId: 'رقم الهوية مرتبط بمستأجر مسجل.',
			duplicatePhone: 'رقم الهاتف مرتبط بمستأجر مسجل.',
			invalidNationalId: 'يجب أن يبدأ رقم الإقامة بـ 1 أو 2 ويتكون من 10 أرقام.',
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
			startTypingTenantSearch: 'ابدأ الكتابة للبحث عن مستأجر.',
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
			percentFulfilled: '{percent}% مكتمل',
			remaining: 'متبقي {amount} ريال',
			terminatedNotice: 'العقود المنتهية مقفلة ولا يمكن تعديل المدفوعات.',
			terminatedSummary: 'العقد منتهي والمدفوعات للقراءة فقط.',
			title: 'المدفوعات',
			titleFor: 'مدفوعات {govId}',
			trackSummary: 'تتبع المدفوعات وإضافة دفعات جديدة.'
		},

		statusDescriptions: {
			active: 'نشط؛ المدفوعات منتظمة',
			defaulted: 'منتهي؛ غير مدفوع بالكامل',
			expired: 'منتهي؛ مدفوع بالكامل',
			fulfilled: 'نشط؛ مدفوع بالكامل',
			scheduled: 'مجدول؛ يبدأ لاحقاً',
			terminated: 'تم إنهاؤه يدوياً'
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
			assignedDescriptionEditable: 'إزالة الوحدة من العقد عند الحاجة.',
			assignedDescriptionLocked: 'عرض الوحدات المرتبطة.',
			assignedTitle: 'الوحدات المرتبطة',

			availableDescription: 'اختر مجمعاً لعرض الوحدات المتاحة.',
			availableTitle: 'الوحدات المتاحة',

			loadingContract: 'جاري تحميل العقد...',

			lockNoticeHasPayments: 'لا يمكن تعديل الوحدات بعد تسجيل مدفوعات.',
			lockNoticeTerminated: 'العقد منتهي ولا يمكن تعديل الوحدات.',

			lockSummaryDefault: 'قم بتعيين الوحدات وإدارتها.',
			lockSummaryHasPayments: 'العقد يحتوي مدفوعات.',
			lockSummaryTerminated: 'العقد مقفل.',

			noAssignedUnits: 'لا توجد وحدات مرتبطة.',
			noAvailableUnits: 'لا توجد وحدات متاحة.',

			selectComplex: 'اختر مجمع',
			selectComplexPlaceholder: 'اختر مجمع',

			unitsFor: 'وحدات {govId}',
			unitsTitle: 'الوحدات'
		}
	},

	settingsHooks: {
		backupCreated: 'تم إنشاء النسخة الاحتياطية!',
		backupDeleted: 'تم حذف النسخة الاحتياطية!',
		backupRestored: 'تمت استعادة النسخة الاحتياطية!',
		databasePathReset: 'تم إعادة تعيين المسار!',
		databasePathUpdated: 'تم تحديث المسار!',
		endingSoonUpdated: 'تم تحديث فترة الإشعار!',
		rollbackRestored: 'تم استعادة النسخة المحمية!',
		startupRecoveryCleared: 'تم مسح الاسترداد ويمكن المحاولة مجدداً.'
	}
} satisfies Translation;

export default ar;
