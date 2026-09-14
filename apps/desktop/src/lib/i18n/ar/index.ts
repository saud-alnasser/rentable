import type { Translation } from '../i18n-types';

const ar = {
	account: {
		groupIdentity: 'مسجل الدخول باسم',
		password: {
			title: 'كلمة المرور',
			description: 'كلمة المرور التي تفتح مكانك في المؤسسة، على كل جهاز تسجل الدخول منه.',
			currentLabel: 'كلمة المرور الحالية',
			nextLabel: 'كلمة المرور الجديدة',
			confirmLabel: 'كلمة المرور الجديدة مرة أخرى',
			mismatch: 'الاثنتان غير متطابقتين.',
			change: 'غيّر كلمة المرور',
			changed: 'تم تغيير كلمة مرورك.'
		},
		title: 'الحساب'
	},

	app: {
		name: 'rentable'
	},
	common: {
		actions: {
			actions: 'الإجراءات',
			add: 'إضافة',
			cancel: 'إلغاء',
			checkForUpdates: 'التحقق من التحديثات',
			checkingForUpdates: 'جاري التحقق من التحديثات...',
			clearFilter: 'إزالة هذه التصفية',
			clearSelection: 'إلغاء التحديد',
			connect: 'ربط',
			connecting: 'جارٍ الربط...',
			copyDetails: 'نسخ التفاصيل',
			chooseFile: 'اختر ملفاً...',
			create: 'إنشاء',
			creating: 'جاري الإنشاء...',
			customizeColumns: 'تخصيص الأعمدة',
			delete: 'حذف',
			deleting: 'جاري الحذف...',
			disconnect: 'فصل',
			downloadAndInstall: 'تنزيل وتثبيت',
			duplicate: 'نسخة جديدة',
			edit: 'تعديل',
			export: 'تصدير',
			exportSelection: 'تصدير المحدد',
			import: 'استيراد',
			installingUpdate: 'جاري تثبيت التحديث...',
			join: 'انضمام',
			newRecord: 'سجل جديد',
			openMenu: 'فتح القائمة',
			openPayments: 'فتح المدفوعات',
			openPreviousRelease: 'فتح الإصدار السابق',
			proceed: 'متابعة',
			remove: 'إزالة',
			renew: 'تجديد',
			renewContract: 'تجديد عقد',
			renewing: 'جاري التجديد...',
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
			selectRecords: 'تحديد السجلات',
			signOut: 'تسجيل الخروج',
			sortBy: 'ترتيب حسب',
			syncing: 'جارٍ المزامنة...',
			syncNow: 'زامن الآن',
			terminate: 'إنهاء',
			transferData: 'الاستيراد والتصدير',
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

		export: {
			description: 'إلى أي ملف يتحول هذا؟'
		},

		formats: {
			csv: 'csv',
			xlsx: 'مصنف إكسل'
		},

		import: {
			title: 'استيراد {record}',
			missingColumns: 'هذا الملف تنقصه الأعمدة: {columns}. لا يمكن قراءة شيء منه.',
			collision: 'الصفان {rows} يحملان {identity} نفسه. لن يُستورد شيء حتى يُحذف أحدهما.',
			nothingToCreate: 'كل صف في هذا الملف موجود هنا أصلاً أو لا يمكن قراءته، فلا شيء ليُستورد.',
			willCreate: 'سيتم إنشاء {count|number} سجل',
			willReject: 'سيتم تخطي {count|number} صف',
			rejectedRow: 'الصف {row|number}',
			reasons: {
				duplicateOfExisting: '{detail} موجود هنا أصلاً',
				missingValue: 'لا يوجد {detail}',
				invalid: 'تعذّرت قراءة {detail}',
				unresolved: 'يشير إلى {detail} وهو غير موجود هنا'
			},
			incompleteColumns:
				'هذا الملف لا يحمل {columns}، فلا يمكن إنشاء أي سجل منه — يمكن فقط التعرف على ما هو موجود هنا أصلاً.',
			skippedUnresolved: '{count|number} يشير إلى سجل غير موجود هنا',
			noSheets: 'لا يحتوي هذا الملف على أي ورقة معروفة، فلا شيء لاستيراده.',
			sheetMissingColumns: 'تنقص ورقة {sheet} الأعمدة: {columns}. لا يمكن قراءة شيء من هذا الملف.',
			sheetIncompleteColumns:
				'لا تحمل ورقة {sheet} العمود {columns}، فلا يمكن إنشاء أي سجل منها — يمكن فقط التعرف على ما هو موجود هنا أصلاً.',
			sheetCollision:
				'في ورقة {sheet}، يدّعي الصفان {rows} السجل نفسه {identity}. لن يُستورد شيء حتى يُحذف أحدهما.',
			unresolvedRefused:
				'يشير {count|number} صف إلى سجل لا تحتويه أي ورقة، فلا يمكن استيراد شيء من هذا الملف.',
			unresolvedRow: 'الصف {row|number} في {sheet} يشير إلى {reference}',
			skippedHeld: '{count|number} موجود هنا أصلاً',
			skippedIncomplete: '{count|number} تنقصه قيمة مطلوبة',
			skippedUnreadable: '{count|number} تعذّرت قراءته',
			more: 'و{count|number} غيرها'
		},

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
		},

		labels: {
			action: 'إجراء',
			activeContracts: 'العقود السارية',
			amount: 'المبلغ',
			appVersion: 'إصدار التطبيق',
			availableVersion: 'الإصدار المتاح',
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
			expected: 'المتوقع',
			governmentId: 'المعرف الحكومي',
			information: 'المعلومات',
			governmentIdOptional: 'المعرف الحكومي (اختياري)',
			location: 'الموقع',
			name: 'الاسم',
			nationalId: 'الهوية الوطنية',
			noticeWindowDays: 'فترة الإشعار (أيام)',
			occupiedUnits: 'وحدات مشغولة',
			payment: 'دفعة',
			paid: 'المدفوع',
			paymentDate: 'تاريخ الدفع',
			period: 'الفترة',
			paymentFulfillment: 'تحقق الدفع',
			phone: 'الهاتف',
			rank: 'الأولوية',
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
			copied: 'تم النسخ إلى الحافظة',
			copyFailed: 'لا يوجد ما يمكن نسخه.',
			exported: 'تم التصدير إلى {path}',
			loadingRecord: 'جاري تحميل السجل...',
			loadingSettings: 'جاري تحميل الإعدادات...',
			noResults: 'لا توجد نتائج.',
			unexpectedError: 'حدث خطأ غير متوقع!',
			unknown: 'غير معروف'
		},

		nav: {
			account: 'الحساب',
			complexes: 'المجمعات',
			contracts: 'العقود',
			dashboard: 'لوحة التحكم',
			organization: 'المؤسسة',
			payments: 'المدفوعات',
			primary: 'الرئيسي',
			settings: 'الإعدادات',
			tenants: 'المستأجرون',
			units: 'الوحدات',
			workspace: 'مساحة العمل'
		},

		periods: {
			'last-month': 'الشهر الماضي',
			'last-year': 'السنة الماضية',
			'this-month': 'هذا الشهر',
			'this-year': 'هذه السنة'
		},

		selection: {
			more: 'و{count|number} غيرها',
			nothingToDo: 'لا يمكن تنفيذ هذا الإجراء على أي من السجلات المحددة.',
			outcomeChanged:
				'تغيّرت مساحة العمل أثناء فتح هذه النافذة، فتعذّر تنفيذ {records}. لم تتم أي إعادة محاولة.',
			outcomeChangedCount:
				'تغيّرت مساحة العمل أثناء فتح هذه النافذة، فتعذّر تنفيذ {count|number} سجل. لم تتم أي إعادة محاولة.'
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
			focusSearch: 'البحث في هذه القائمة',
			goToFirstPage: 'اذهب للصفحة الأولى',
			goToLastPage: 'اذهب للصفحة الأخيرة',
			goToNextPage: 'اذهب للصفحة التالية',
			goToPreviousPage: 'اذهب للصفحة السابقة',
			moveBetweenRecords: 'التنقل بين السجلات',
			openRecord: 'فتح السجل المحدد',
			pageOf: 'الصفحة {page} من {count}',
			recordsSelected: 'تم تحديد {count|number}',
			results: '{count|number} نتيجة',
			rowsPerPage: 'عدد الصفوف لكل صفحة',
			rowsSelected: '{selected} من {total} صف محدد.',
			searchPlaceholder: 'بحث...',
			selectRecord: 'تحديد هذا السجل'
		},

		time: {
			day: '{count} يوم',
			days: '{count} أيام'
		},

		undo: {
			assigned: 'تغيير وحدات {record}',
			created: 'إنشاء {record}',
			deleted: 'حذف {record}',
			createdMany: 'إنشاء {count|number} سجل',
			deletedMany: 'حذف {count|number} سجل',
			edited: 'تعديل {record}',
			nothingToRedo: 'لا يوجد ما يمكن إعادته',
			nothingToUndo: 'لا يوجد ما يمكن التراجع عنه',
			redo: 'إعادة',
			redone: 'تمت إعادة {change}',
			renewed: 'تجديد {record}',
			terminated: 'إنهاء {record}',
			terminatedMany: 'إنهاء {count|number} عقد',
			undo: 'تراجع',
			undone: 'تم التراجع عن {change}',
			unterminated: 'استعادة {record}',
			unterminatedMany: 'استعادة {count|number} عقد'
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
			commandPaletteChooseRecord: 'اكتب للبحث عن السجل الذي سينفذ عليه.',
			commandPaletteDescription: 'ابحث عن أمر للتنفيذ',
			commandPaletteEmpty: 'لا توجد نتائج مطابقة',
			commandPaletteGoTo: 'الانتقال إلى',
			keyboardShortcuts: 'اختصارات لوحة المفاتيح',
			keyboardShortcutsDescription: 'كل اختصار يستجيب له التطبيق، أينما كنت.',
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
			blockedContracts: '{count|number} عقد مرتبط به',
			blockedDescription: 'لا يمكن الحذف ما دامت العناصر التالية مرتبطة به.',
			blockedPayments: '{count|number} دفعة مسجلة عليه',
			blockedUnits: '{count|number} وحدة تابعة له',
			description: 'يمكنك التراجع عن هذا ما دام التطبيق مفتوحًا.',
			unnamedRecord: 'هذا السجل'
		}
	},
	layout: {
		error: {
			description: 'حدث خطأ في هذه الشاشة. العودة إلى لوحة التحكم تحل المشكلة عادة.',
			goHome: 'الذهاب إلى لوحة التحكم',
			retry: 'المحاولة مرة أخرى',
			shellDescription:
				'حدث خطأ خارج هذه الشاشة، فلا توجد شاشة للعودة إليها. المحاولة مرة أخرى تعيد رسم النافذة من جديد.',
			shellTitle: 'تعذر رسم التطبيق',
			title: 'تعذر عرض هذه الشاشة'
		},

		accountMenu: {
			label: 'الحساب',
			signIn: 'تسجيل الدخول',
			signedOutHint: 'تسجيل الدخول',
			signedOutName: 'مستخدم'
		},

		workspaceMenu: {
			create: 'مساحة عمل جديدة',
			invite: 'دعوة',
			locked: 'غير متاح',
			settings: 'الإعدادات',
			members: '{count|number} عضو',
			switchTo: 'التبديل إلى',
			open: 'مفتوحة',
			inviteRefused: 'المالك أو أحد المديرين هو من يدعو. اسأل أحدهم.',
			workspaceRefusedOwner: 'المالك هو من ينشئ مساحة العمل. اسأل المالك.',
			workspaceRefusedAuthority:
				'إنشاء مساحة عمل يحتاج إلى حساب Turso، وهذا الجهاز غير متصل به. أعد ربطه من صفحة المؤسسة.'
		},

		noWorkspace: {
			nameLabel: 'اسم مساحة العمل',
			create: 'أنشئ مساحة العمل',
			creating: 'يجري إنشاء مساحة العمل على حساب Turso الخاص بك. يستغرق هذا لحظة.',
			created: 'تم إنشاء مساحة العمل.',
			ownerOnly: 'المالك وحده من ينشئ مساحة العمل الأولى، من الجهاز الذي ربط حساب Turso.',
			title: 'لا مساحة عمل بعد',
			description: 'لا تملك مؤسستك مساحة عمل بعد. أنشئ الأولى لتبدأ حفظ السجلات.'
		},

		signIn: {
			noOrganizationTitle: 'مرحبًا',
			noOrganizationDescription:
				'أنشئ مؤسسة على حساب Turso الخاص بك، أو اربط الجهاز بمؤسسة عبر الرابط الذي استلمته.',
			organizationDescription:
				'كلمة مرورك تفتح مكانك في المؤسسة، على هذا الجهاز، مع اتصال أو من دونه.',
			organization: 'المؤسسة',
			username: 'اسم المستخدم',
			password: 'كلمة المرور',
			unlock: 'افتح',
			unlocking: 'يجري فتح مكانك في المؤسسة. يستغرق هذا لحظة عن قصد.',
			roleOwner: 'مالك',
			roleAdministrator: 'مدير',
			roleMember: 'عضو',
			setUp: 'أنشئ مؤسسة',
			connectByLink: 'اربط عبر الرابط',
			useALink: 'افتح رابطًا لديك',
			disconnect: 'افصل هذا الجهاز',
			disconnectDescription:
				'ينسى هذا الجهاز المؤسسة: تُحذف كل نسخة منها ومن مساحات عملها محفوظة هنا، ويُنسى حساب Turso معها. لا يتغير شيء على Turso، ورابط المؤسسة يصل هذا الجهاز بها من جديد.',
			title: 'تسجيل الدخول'
		},

		startup: {
			accountChoiceEmpty: 'لا توجد ملفات عمل متاحة بعد.',
			factUpdatingTo: 'الترقية إلى',
			failedToStartFallback: 'فشل في تشغيل التطبيق.',
			failureDescription:
				'تعذر فتح مساحة عملك. لا شيء مما سُجّل فيها في خطر، فهي محفوظة على هذا الجهاز وفي حسابك، وإعادة المحاولة هي أول ما يُجرَّب.',
			failureTitle: 'تعذر على rentable إكمال التشغيل',
			previousVersion: 'الإصدار السابق',
			recoveryDetails:
				'لا شيء مما سُجّل في مساحة العمل هذه في خطر: فهي محفوظة نيابةً عنك ولدى هذا الجهاز نسخة منها. وإذا استمر فشل التشغيل، فأعد تثبيت الإصدار السابق قبل فتح rentable مرة أخرى.',
			recoveryRequiredTitle: 'مطلوب استرداد التحديث',
			stageAccount: 'التحقق من حسابك',
			stageChanges: 'البحث عن التغييرات',
			stageRecords: 'تحديث السجلات',
			migrationApplying:
				'يجري رفع مساحة العمل إلى هذا الإصدار من rentable. يصل هذا إلى Turso ويستغرق لحظة؛ لا شيء هنا عالق.',
			migrationWaiting:
				'عضو آخر يرفع مساحة العمل إلى هذا الإصدار من rentable. ننتظره، حتى {until} على أبعد تقدير.',
			stageSettings: 'قراءة إعداداتك',
			stageWorkspace: 'فتح مساحة عملك'
		}
	},

	dashboard: {
		empty: {
			description: 'لا يوجد متأخر ولا متعثر ولا عقد ينتهي خلال فترة الإشعار.',
			title: 'لا شيء يحتاج إلى إجراء اليوم.'
		},

		figures: {
			collected: 'المحصل',
			occupiedUnits: 'الوحدات المشغولة',
			outstanding: 'المستحق'
		},

		sections: {
			alsoEnding: 'ينتهي أيضاً',
			contractCount: '{count|number} عقد',
			openContract: 'افتح عقد {tenant}',
			renewContract: 'جدّد عقد {tenant}',
			seeAll: 'عرض الكل ({count|number})'
		},

		title: 'لوحة التحكم'
	},

	settings: {
		accountDescription:
			'هذا الجهاز مسجل الدخول بالحساب أدناه. تسجيل الخروج يغلق مساحة العمل على هذا الجهاز وحده — تبقى مساحة العمل كما هي، ويعيد تسجيل الدخول فتحها.',
		aboutTitle: 'حول',
		createdAt: 'تم الإنشاء {value}',

		diagnosticsDescription:
			'يحفظ رينتابل سجلاً بما يجري على هذا الجهاز، ليمكن تتبع أي عطل بعد وقوعه. لا تغادر الملفات هذا الجهاز، وحجمها محدود، وتُحذف كلمات المرور ورموز الحسابات قبل كتابة أي شيء.',
		diagnosticsLocationLabel: 'موقع السجل',
		diagnosticsReveal: 'فتح مجلد السجل',

		downloadingUpdate: 'جاري تنزيل التحديث',

		endingSoonDescription:
			'يظهر العقد في لوحة التحكم ضمن العقود القريبة من الانتهاء قبل هذا العدد من الأيام من نهايته.',
		endingSoonInvalid: 'يجب أن يكون عدد الأيام أكبر من صفر',
		endingSoonTitle: 'قريب من الانتهاء',

		groupDiagnostics: 'التشخيص',
		groupGeneral: 'عام',
		groupUpdates: 'التحديثات',
		latestRelease: 'أنت تستخدم أحدث إصدار.',

		loadErrorTitle: 'الإعدادات غير متاحة حالياً',
		openWorkspaceAction: 'فتح مساحة العمل',

		transferImportTitle: 'استيراد مساحة عمل',
		transferImportSuccess: 'تم استيراد الملف',

		restartNotice:
			'تم تثبيت التحديث. قد يتم إغلاق التطبيق تلقائياً أثناء التثبيت، أو أعد تشغيله لإكمال التحديث.',

		pathOverrideDescription:
			'عند تركه فارغاً سيُستخدم المسار الافتراضي أعلاه. عند الحفظ يُعاد الاتصال فوراً، ويُفتح مسار قاعدة البيانات المحدد عند بدء التشغيل.',
		pathOverridePlaceholder: 'اتركه فارغاً لاستخدام المسار الافتراضي',

		localeDescription: 'تتغير الواجهة بمجرد اختيارك.',
		localeLabel: 'لغة العرض',
		localeTitle: 'اللغة',

		title: 'الإعدادات',

		updatesChecking: 'جارٍ التحقق من التحديثات...',
		updatesDescription:
			'تحقق مما إذا كان هناك إصدار أحدث من رينتابل وثبّته. وإذا تعذر تشغيل التطبيق بعد ذلك، فسيعرض إعادة الإصدار الذي كنت عليه.',

		usingCustomDatabasePath: 'يتم استخدام مسار قاعدة بيانات مخصص.',
		usingDefaultDatabasePath: 'يتم استخدام المسار الافتراضي.'
	},
	complexes: {
		hooks: {
			createSuccess: 'تم إنشاء المجمع بنجاح!',
			deleteManySuccess: 'تم حذف {count|number} مجمع',
			deleteSuccess: 'تم حذف المجمع بنجاح!',
			unitCreateManySuccess: 'تم إنشاء {count|number} وحدة',
			unitCreateSuccess: 'تم إنشاء الوحدة بنجاح!',
			unitDeleteManySuccess: 'تم حذف {count|number} وحدة',
			unitDeleteSuccess: 'تم حذف الوحدة بنجاح!',
			unitUpdateSuccess: 'تم تحديث الوحدة بنجاح!',
			updateSuccess: 'تم تحديث المجمع بنجاح!'
		},

		form: {
			duplicateName: 'الاسم مرتبط بمجمع مسجل مسبقاً.',
			duplicateUnitName: '{name} موجود في القائمة بالفعل.',
			duplicateUnitNames: 'هناك وحدتان بنفس الاسم؛ لكل وحدة اسمها.',
			noUnitNamed: 'سمِّ وحدة واحدة على الأقل.',
			noUnitsYet: 'لا توجد وحدات بعد. أضفها هنا أو لاحقاً من المجمع نفسه.',
			unitName: 'اسم الوحدة',
			unitRangeEndBeforeStart: 'يجب ألا يقل الرقم الأخير عن الرقم الأول.',
			unitRangeHint: 'اسم واحد، أو مجموعة — «أ 1-18» تضيف أ 1 حتى أ 18.',
			unitRangeTooLarge: 'تضيف المجموعة الواحدة {max} وحدة كحد أقصى في المرة.'
		},

		selection: {
			deleteSummary: 'سيتم حذف {count|number} مجمع',
			deleteTitle: 'حذف المجمعات',
			refusedHoldsUnits: '{count|number} ما زالت تحمل وحدات',
			refusedMissing: '{count|number} لم تعد موجودة في مساحة العمل',
			unitDeleteSummary: 'سيتم حذف {count|number} وحدة',
			unitDeleteTitle: 'حذف الوحدات',
			unitRefusedHoldsContracts: '{count|number} مذكورة في عقد',
			unitRefusedMissing: '{count|number} لم تعد موجودة في مساحة العمل'
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
			deleteManySuccess: 'تم حذف {count|number} مستأجر',
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
		},

		selection: {
			deleteSummary: 'سيتم حذف {count|number} مستأجر',
			deleteTitle: 'حذف المستأجرين',
			refusedHoldsContracts: '{count|number} ما زالوا يحملون عقوداً',
			refusedMissing: '{count|number} لم يعودوا موجودين في مساحة العمل'
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
			renewDescription:
				'المستأجر والوحدات والدورة والتكلفة تنتقل من العقد الجاري تجديده. حدّد مدة التجديد.',
			renewTitle: 'تجديد العقد',
			renewalMustFollowOriginal: 'يجب أن يبدأ التجديد بعد انتهاء العقد الذي يجدده.',
			renewalUnitsUnavailable:
				'يحتفظ عقد آخر بواحدة أو أكثر من هذه الوحدات خلال المدة المحددة. اختر مدة أخرى.',
			searchAndSelectTenant: 'ابحث واختر مستأجر',
			searchTenantPlaceholder: 'ابحث عن مستأجر بالاسم أو الهوية أو الهاتف...',
			startDateRequired: 'تاريخ البداية مطلوب.',
			tenantRequired: 'المستأجر مطلوب.'
		},

		hooks: {
			createPaymentSuccess: 'تم إنشاء الدفعة بنجاح!',
			createSuccess: 'تم إنشاء العقد بنجاح!',
			deleteManyPaymentsSuccess: 'تم حذف {count|number} دفعة',
			deleteManySuccess: 'تم حذف {count|number} عقد',
			deletePaymentSuccess: 'تم حذف الدفعة بنجاح!',
			deleteSuccess: 'تم حذف العقد بنجاح!',
			renewSuccess: 'تم تجديد العقد بنجاح!',
			restoreManySuccess: 'تمت استعادة {count|number} عقد',
			restoreSuccess: 'تمت استعادة العقد بنجاح!',
			terminateManySuccess: 'تم إنهاء {count|number} عقد',
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

		ranks: {
			endingSoon: 'قريب الانتهاء',
			overdue: 'متأخر',
			owing: 'مستحق'
		},

		selection: {
			deleteSummary: 'سيتم حذف {count|number} عقد',
			deleteTitle: 'حذف العقود',
			paymentDeleteSummary: 'سيتم حذف {count|number} دفعة',
			paymentDeleteTitle: 'حذف الدفعات',
			paymentRefusedContractTerminated: '{count|number} تخص عقداً منتهياً',
			paymentRefusedMissing: '{count|number} لم تعد موجودة في مساحة العمل',
			refusedHoldsPayments: '{count|number} ما زالت تحمل دفعات',
			refusedHoldsUnits: '{count|number} ما زالت تحمل وحدات',
			refusedMissing: '{count|number} لم تعد موجودة في مساحة العمل',
			refusedNotRestorable: '{count|number} ليست منتهية',
			refusedNotTerminable: '{count|number} لا يمكن إنهاؤها يدوياً',
			restoreSummary: 'سيتم استعادة {count|number} عقد',
			restoreTitle: 'استعادة العقود',
			terminateSummary: 'سيتم إنهاء {count|number} عقد',
			terminateTitle: 'إنهاء العقود'
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
			available: 'المتاحة',
			assigned: 'المسندة',

			transferDescription:
				'انقل الوحدة بين الجانبين؛ كل نقل يُحفظ فور حدوثه. الوحدات المرتبطة بعقد تتداخل مدته مع هذا العقد لا تُعرض.',

			lockNoticeHasPayments: 'لا يمكن تعديل الوحدات بعد تسجيل مدفوعات.',
			lockNoticeTerminated: 'العقد منتهي ولا يمكن تعديل الوحدات.',

			noAssignedUnits: 'لا توجد وحدات مرتبطة.',
			noAvailableUnits: 'لا توجد وحدات متاحة.'
		}
	},

	settingsHooks: {
		databasePathReset: 'تم إعادة تعيين المسار!',
		databasePathUpdated: 'تم تحديث المسار!',
		endingSoonUpdated: 'تم تحديث فترة الإشعار!',
		profileSwitched: 'تم تبديل مساحة العمل بنجاح!',
		workspaceUpToDate: 'مساحة العمل محدّثة!',
		startupRecoveryCleared: 'تم مسح الاسترداد ويمكن المحاولة مجدداً.'
	},

	organization: {
		setup: {
			setupTitle: 'إنشاء مؤسسة',
			setupDescription:
				'يعمل rentable على حساب Turso تملكه أنت. سجلاتك تعيش هناك، ولا شيء منها عندنا.',
			connectTitle: 'اربط حساب Turso الخاص بك',
			connectDescription: 'ستعيش مؤسستك على حساب Turso الخاص بك. موافقة واحدة في المتصفح تكفي.',
			position: 'الخطوة {step|number} من {total|number}',
			groupCoverage: 'تشمل الموافقة كل قاعدة بيانات في المجموعة التي تختارها، ولا شيء خارجها.',
			accountCreation:
				'لا يحمل حساب Turso المجاني أو حساب Developer سوى مجموعة واحدة، لذا يبقى تخصيص حساب لـ rentable وحده هو الخيار الأنظف، وشاشة الموافقة تفتح لك حساباً إن لم يكن لديك واحد. أما في الحساب المدفوع فاختر مجموعة فارغة.',
			succession:
				'في الحساب الشخصي أنت وحدك من يمنح الصلاحية مجدداً؛ وفي منظمة Turso يستطيع أي مدير ذلك، وتستطيع Turso نقل المجموعة. لا يفعل rentable أياً منهما نيابة عنك.',
			openDashboard: 'افتح لوحة تحكم Turso',
			connect: 'اربط حساب Turso',
			connecting: 'أكمل الموافقة في نافذة المتصفح التي فُتحت للتو.',
			connected: 'تم ربط حساب Turso.',
			consentAbandoned: 'لم تُمنح الموافقة. لم يُنشأ شيء.',
			consentFailed: 'رفضت Turso الموافقة.',
			nameTitle: 'سمِّ مؤسستك',
			nameDescription:
				'اختر اسماً للمؤسسة، واسم المستخدم الخاص بك، وكلمة مرور. كلمة المرور تفتح مكانك فيها.',
			nameLabel: 'اسم المؤسسة',
			usernameLabel: 'اسم المستخدم الخاص بك',
			nameRequired: 'أعطِ المؤسسة اسماً.',
			nameTooLong: 'هذا الاسم طويل جداً.',
			passwordLabel: 'كلمة مرورك',
			passwordFloor:
				'استخدم 12 حرفاً على الأقل. كلمة المرور هذه هي كل ما يقف بين السجلات وأي شخص يحمل نسخة منها.',
			passwordTooShort: 'استخدم 12 حرفاً على الأقل.',
			create: 'أنشئ المؤسسة',
			creating: 'يجري إنشاء المؤسسة على حساب Turso الخاص بك...',
			workspaceTitle: 'أنشئ مساحة عملك الأولى',
			workspaceDescription:
				'تحتفظ مساحة العمل بمجموعة واحدة من السجلات. يمكنك إضافة المزيد لاحقاً من داخل التطبيق.',
			copyLink: 'انسخ الرابط',
			linkCopied: 'تم نسخ الرابط.',
			continue: 'متابعة',
			back: 'رجوع'
		},
		join: {
			title: 'الربط بمؤسسة',
			description:
				'الصق الرابط الذي سُلّم إليك. رابط المؤسسة يسجّل المؤسسة على هذا الجهاز وينقلك إلى تسجيل الدخول، ورابط الدعوة يسجّلها ويطلب منك اختيار كلمة مرور.',
			linkLabel: 'رابط مؤسسة أو رابط دعوة',
			reading: 'يجري الربط بالمؤسسة...',
			unreadable: 'هذا ليس رابطًا من rentable. الصق الرابط كاملاً كما سُلّم إليك تمامًا.',
			unreachable: 'تعذّر الوصول إلى المؤسسة. الرابط صحيح؛ حاول مجددًا حين يعود الاتصال.',
			lapsed: 'انتهت صلاحية هذه الدعوة. اطلب رابطًا جديدًا ممن دعاك.',
			consumed:
				'سبق أن فُتح رابط الدعوة هذا. الجهاز مرتبط بالمؤسسة، فسجّل الدخول باسم المستخدم وكلمة المرور التي اخترتها.',
			revoked: 'سُحبت هذه الدعوة. اطلب رابطًا جديدًا ممن دعاك.',
			anotherOrganization: 'هذا الجهاز مرتبط بمؤسسة أخرى. افصله عنها أولاً، ثم افتح هذا الرابط.',
			toSignIn: 'انتقل إلى تسجيل الدخول',
			passwordTitle: 'اختر كلمة مرورك',
			passwordDescription:
				'كلمة المرور تفتح مكانك في المؤسسة على هذا الجهاز وعلى أي جهاز آخر تسجّل منه الدخول. لا أحد يستطيع استعادتها لك؛ الطريق الوحيد للعودة رابط جديد.',
			organizationLabel: 'المؤسسة',
			usernameLabel: 'اسم المستخدم',
			confirmLabel: 'كلمة مرورك مجددًا',
			mismatch: 'الكلمتان غير متطابقتين.',
			tryAgain: 'حاول مجددًا',
			back: 'رجوع'
		},
		dashboard: {
			members: 'الأعضاء',
			pendingAccounts: 'الحسابات المعلّقة',
			workspaces: 'مساحات العمل',
			inviteTitle: 'ادعُ شخصًا',
			inviteDescription:
				'الدعوة تصنع حسابهم في المؤسسة: اسم مستخدم ودور ومساحات العمل التي يحملونها. أنت من يسلمهم الرابط واسم المستخدم وكلمة المرور بنفسك.',
			role: 'الدور',
			administratorsAreTheOwners: 'المالك وحده يستطيع دعوة مدير.',
			noWorkspaceToGrant: 'لا مساحة عمل لمنحها بعد. يمكن منحهم واحدة لاحقًا.',
			invite: 'ادعُ',
			cannotSend:
				'rentable لا يرسل شيئًا. انسخ الرابط أدناه وسلّمه للشخص بنفسك؛ وبفتحه يختار كلمة مروره.',
			invitationLinkTitle: 'رابط الدعوة',
			done: 'تم',
			notYetSignedIn: 'لم يسجل الدخول بعد',
			resetPassword: 'أعد تعيين كلمة المرور',
			rename: 'غيّر الاسم',
			renameDescription:
				'اسم المستخدم الذي يسجل به الدخول على كل جهاز. لا شيء يخبره بأنه تغيّر؛ أخبره بنفسك.',
			username: 'اسم المستخدم',
			usernameRules:
				'اسم المستخدم من ثلاثة إلى اثنين وثلاثين حرفًا من الحروف والأرقام والنقاط والشرطات السفلية والشرطات',
			renamed: 'غُيّر اسم العضو.',
			linkTitle: 'رابط المؤسسة',
			linkDescription:
				'يربط الرابط جهازًا آخر بهذه المؤسسة؛ ومع اسم مستخدم وكلمة مرور يكون هو الطريق إلى الداخل. يحمل عرضًا للقراءة فقط للدليل، فشاركه كما تشارك كلمة مرور.',
			authorityTitle: 'حساب Turso',
			authorityDescription:
				'هذا الجهاز لا يحمل صلاحية على حساب Turso الخاص بالمؤسسة، لذا لا يستطيع إنشاء مساحة عمل أو حظر أحد أو تجديد الاعتمادات. الصلاحية لا مكان لاستعادتها منه؛ امنح الموافقة مجددًا هنا، كما فعلت في التشغيل الأول.',
			authorityReconnected: 'حساب Turso متصل على هذا الجهاز.',
			remove: 'أزل',
			removeDescription:
				'يتوقف تجديد اعتماده، فينتهي وصوله حين تنتهي صلاحية اعتماده، خلال أربعة أسابيع، ولا يتأثر أحد غيره. ما على جهازه يبقى هناك؛ لا شيء يصل إليه.',
			removeAndLockOut: 'أزل واحظر',
			lockOutReading: 'تجري قراءة مساحات العمل التي يمسّها هذا...',
			lockOutDescription:
				'ينتهي وصوله إلى {workspaces} فورًا. Turso يلغي لكل مساحة عمل وبالكامل، لذا يتوقف {count|number} من الأعضاء الآخرين في تلك المساحات عن المزامنة حتى يعيد تطبيقهم الاتصال، وهو ما يفعله من تلقاء نفسه. ما على جهازه يبقى هناك.',
			removed: 'أُزيل العضو. ينتهي وصوله حين تنتهي صلاحية اعتماده.',
			lockedOut: 'حُظر العضو. يعيد {count|number} من الأعضاء الآخرين الاتصال من تلقاء أنفسهم.',
			unreachableWorkspaces:
				'أنت لا تملك {workspaces}، لذا لم تستطع إعادة التعيين استعادتها. يمكن لمدير يملكها منحها مجددًا.',
			standingOpen: 'مفتوحة',
			standingLapsed: 'منتهية',
			standingConsumed: 'مستخدمة',
			noPendingAccounts: 'لا حسابات معلّقة.',
			revoke: 'ألغِ',
			revoked: 'أُلغيت الدعوة.',
			noWorkspaces: 'لا مساحة عمل بعد.',
			accessFull: 'وصول كامل',
			accessReadOnly: 'قراءة فقط',
			disconnectForgets:
				'الفصل ينسى المؤسسة على هذا الجهاز: يُسجَّل خروجك، وتُحذف كل نسخة منها ومن مساحات عملها محفوظة هنا، وتُمسح صلاحية Turso. لا يُمسّ شيء على Turso، ويربط الرابط هذا الجهاز مجددًا. للوصول إلى مؤسسة أخرى، افصل ثم اربط بها.',
			disconnect: 'افصل',
			disconnected: 'لم يعد هذا الجهاز يحتفظ بالمؤسسة.'
		},
		disconnectAction: 'افصل',
		disconnectDescription:
			'يحتفظ هذا الجهاز برمز وصول إلى حساب Turso الذي تقوم عليه مؤسستك. وفصله ينسى الرمز هنا، فلا يبقى على هذا الجهاز ما يصل إلى ذلك الحساب.',
		disconnectRevokes:
			'نسيان الرمز لا يلغيه. يبقى ما منحته قائماً حتى تنهيه بنفسك من لوحة تحكم Turso على app.turso.tech.',
		disconnectRevokesAt: 'app.turso.tech',
		disconnected: 'لم يعد هذا الجهاز يحتفظ برمز وصول إلى حساب Turso.'
	},

	workspace: {
		groupIdentity: 'مساحة العمل هذه',
		groupMembers: 'الأعضاء',
		groupSync: 'المزامنة',
		groupTransfer: 'تصدير / استيراد',
		identityDescription: 'الصورة عنصر نائب، ولا يمكن تغييرها بعد.',
		membersDescription: 'شخص واحد، وهو الوحيد الممكن اليوم. دعوة غيره تأتي مع المؤسسات.',
		nameTooLong: 'هذا الاسم طويل جداً.',
		nameRequired: 'أعطِ مساحة العمل اسماً.',
		rename: 'إعادة تسمية',
		renameDescription: 'اسم مساحة العمل هذه على كل جهاز مسجل الدخول إليها.',
		renamed: 'تمت إعادة تسمية مساحة العمل.',
		roleOwner: 'المالك',
		syncDescription:
			'تُحفظ هذه المساحة نيابةً عنك وتصل إلى هذا الجهاز تلقائياً. والتحقق الآن يبقيها تعمل دون اتصال لثلاثة أيام قادمة.',
		syncStatusNeedsReconnect: 'يحتاج إلى إعادة ربط',
		syncStatusSynced: 'تمت مزامنته',
		syncStatusAccountRefused: 'الحساب يحتاج إلى اهتمام',
		syncStatusCredentialRefused: 'صلاحية الوصول تحتاج إلى اهتمام',
		credentialRefused:
			'تم تحديث صلاحية وصولك إلى مساحة العمل هذه، وهذا الجهاز يجمع بيانات الاعتماد الجديدة. إذا لم يُحل الأمر من تلقاء نفسه، فاسأل مالك المنظمة. يستمر كل شيء هنا في العمل في هذه الأثناء.',
		accountRefusedMember:
			'حساب Turso الخاص بالمؤسسة يحتاج إلى اهتمام، لذا لا يصل شيء إلى Turso حاليًا. أخبر {owner}. كل شيء هنا يواصل العمل على هذا الجهاز، وما تكتبه يُرسل حين يُعتنى بالحساب.',
		accountRefusedOwner:
			'يرفض Turso حساب المؤسسة: {detail}. كل شيء يواصل العمل على هذا الجهاز، وما يُكتب يُرسل حين يُعتنى بالحساب. مكان الاعتناء به هو لوحة تحكم Turso نفسها على app.turso.tech، تحت المؤسسة التي تحمل مجموعتك.',
		accountRefusedOwnerNoDetail:
			'يرفض Turso حساب المؤسسة. كل شيء يواصل العمل على هذا الجهاز، وما يُكتب يُرسل حين يُعتنى بالحساب. مكان الاعتناء به هو لوحة تحكم Turso نفسها على app.turso.tech، تحت المؤسسة التي تحمل مجموعتك.',
		transferDescription:
			'اكتب كل شيء — المستأجرين والمجمعات والوحدات والعقود والمدفوعات — في ملف واحد، أو اقرأ ملفاً كهذا. تشير السجلات إلى بعضها بالأسماء لا بالأرقام، فيفتح الملف على أي جهاز.',
		title: 'مساحة العمل'
	}
} satisfies Translation;

export default ar;
