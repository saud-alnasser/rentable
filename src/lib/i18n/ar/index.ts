import type { Translation } from '../i18n-types';

const ar = {
	app: {
		name: 'القابل للايجار'
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
		description: 'تتبع حالة العقود وأداء المدفوعات ونسبة الإشغال بعد مزامنة الحالة.',

		followUps: {
			countOne: '{count} متابعة مفتوحة',
			countOther: '{count} متابعات مفتوحة',
			description:
				'العقود التي لها مستحقات مجدولة حتى اليوم هذا الشهر، أو رصيد متعثر متأخر يحتاج متابعة.',
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
					'حالة العقود الحالية مع تحديد القريبة من الانتهاء بناءً على فترة الإشعار {noticeWindow}.',
				heroHint: '{active} نشط • {endingSoon} ينتهي خلال {noticeWindow}',
				heroLabel: 'حجم المحفظة الحالي',
				title: 'العقود'
			},

			money: {
				description:
					'المستحقات المجدولة لشهر {monthLabel}، والمدفوعات المستلمة هذا الشهر، وأرصدة العقود.',
				heroHint: '{rate}% من مستحقات {monthLabel} تم تغطيتها',
				heroLabel: 'المتبقي حالياً',
				title: 'المال'
			},

			occupancy: {
				description: 'حالة الوحدات بعد مزامنة لوحة التحكم.',
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
		aboutDescription: 'معلومات التطبيق الحالية وأوقات آخر مزامنة ونسخ احتياطي.',
		aboutTitle: 'حول',
		createdAt: 'تم الإنشاء {value}',

		createBackupDescription:
			'يتم حفظ النسخ الاحتياطية في مجلد التطبيق ويمكن استعادتها أدناه. يتم إنشاء نسخ احتياطية محمية قبل التحديثات تلقائياً.',
		createBackupTitle: 'إنشاء نسخة احتياطية',

		databaseDescription:
			'تبديل قاعدة البيانات، استخدام المسار الافتراضي، إنشاء نسخ احتياطية، واستعادة نسخة سابقة.',
		databaseTitle: 'مسار قاعدة البيانات والنسخ الاحتياطية',

		deleteBackupDescription: 'هل أنت متأكد أنك تريد حذف هذه النسخة؟ لا يمكن التراجع.',
		deleteBackupNamedDescription: 'هل أنت متأكد أنك تريد حذف "{name}"؟ لا يمكن التراجع.',
		deleteBackupTitle: 'حذف نسخة احتياطية',

		description:
			'إدارة فترة الإشعار، التحديثات، مسار قاعدة البيانات، النسخ الاحتياطية، ومعلومات التطبيق.',

		downloadingUpdate: 'جاري تنزيل التحديث',

		endingSoonDescription: 'حدد عدد الأيام قبل نهاية العقد ليتم اعتباره قريب الانتهاء.',
		endingSoonInvalid: 'يجب أن تكون فترة الإشعار أكبر من صفر',
		endingSoonTitle: 'فترة الإشعار',

		latestRelease: 'أنت تستخدم أحدث إصدار.',

		loadErrorDescription: 'حدثت مشكلة أثناء تحميل الإعدادات.',
		loadErrorTitle: 'الإعدادات غير متاحة حالياً',

		protectedUpdateBackup: 'نسخة احتياطية محمية',
		releaseAvailable: 'يتوفر تحديث v{version}.',
		restoreBackupTitle: 'استعادة نسخة احتياطية',

		restartNotice:
			'تم تثبيت التحديث. قد يتم إغلاق التطبيق تلقائياً أثناء التثبيت، أو أعد تشغيله لإكمال التحديث.',

		noBackups: 'لا توجد نسخ احتياطية بعد.',

		pathOverrideDescription: 'تركه فارغاً يستخدم المسار الافتراضي. الحفظ يعيد الاتصال فوراً.',
		pathOverridePlaceholder: 'اتركه فارغاً لاستخدام المسار الافتراضي',

		localeDescription: 'اختر لغة العرض المفضلة.',
		localeLabel: 'لغة العرض',
		localeTitle: 'اللغة',

		title: 'الإعدادات',

		updatesChecking: 'جاري التحقق من التحديث...',
		updatesDescription:
			'تحقق من github للإصدارات الجديدة. في حال فشل التشغيل بعد التحديث يمكن التراجع.',
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
			duplicateNationalId: 'رقم الهوية مرتبط بمستأجر مسجل.',
			duplicatePhone: 'رقم الهاتف مرتبط بمستأجر مسجل.',
			invalidNationalId: 'يجب أن يبدأ رقم الإقامة بـ 1 أو 2 ويتكون من 10 أرقام.',
			invalidPhone: 'يجب أن يبدأ رقم الهاتف بـ +966 ويتكون من 10 أرقام.',
			phonePlaceholder: 'الهاتف (+966...)'
		}
	},

	contracts: {
		form: {
			costGreaterThanZero: 'يجب أن تكون التكلفة أكبر من صفر.',
			costPerPaymentGreaterThanZero: 'يجب أن تكون تكلفة الدفعة أكبر من صفر.',
			costRequired: 'التكلفة مطلوبة.',
			duplicateGovernmentId: 'رقم الهوية مرتبط بعقد آخر.',
			endDateAfterStart: 'يجب أن يكون تاريخ النهاية بعد البداية.',
			endDateRequired: 'تاريخ النهاية مطلوب.',
			endDateShort: 'تاريخ النهاية',
			invalidTenant: 'يرجى اختيار مستأجر صالح.',
			loadingTenant: 'جاري تحميل المستأجر...',
			loadingTenants: 'جاري تحميل المستأجرين...',
			noTenantFound: 'لم يتم العثور على مستأجر.',
			paymentAmountGreaterThanZero: 'يجب أن يكون مبلغ الدفع أكبر من صفر',
			paymentAmountRequired: 'مبلغ الدفع مطلوب',
			paymentDateRequired: 'تاريخ الدفع مطلوب',
			pickDate: 'اختر تاريخ',
			pickDateRange: 'اختر نطاق تاريخ',
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
