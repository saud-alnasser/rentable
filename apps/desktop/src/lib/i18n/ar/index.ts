import type { Translation } from '../i18n-types';

const ar = {
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
			clearFilters: 'إزالة التصفية',
			clearSearch: 'مسح البحث',
			clearSearchAndFilters: 'مسح البحث والتصفية',
			clearSelection: 'إلغاء التحديد',
			connect: 'ربط',
			copyDetails: 'نسخ التفاصيل',
			details: 'التفاصيل',
			chooseFile: 'اختر ملفاً...',
			create: 'إنشاء',
			creating: 'جاري الإنشاء...',
			customizeColumns: 'تخصيص الأعمدة',
			delete: 'حذف',
			deleting: 'جاري الحذف...',
			downloadAndInstall: 'تنزيل وتثبيت',
			duplicate: 'نسخة جديدة',
			edit: 'تعديل',
			export: 'تصدير',
			exportSelection: 'تصدير المحدد',
			goBack: 'العودة',
			import: 'استيراد',
			installingUpdate: 'جاري تثبيت التحديث...',
			join: 'انضمام',
			newComplex: 'مجمع جديد',
			newContract: 'عقد جديد',
			newPayment: 'دفعة جديدة',
			newRecord: 'سجل جديد',
			newTenant: 'مستأجر جديد',
			newUnit: 'وحدة جديدة',
			openMenu: 'فتح القائمة',
			openPayments: 'فتح المدفوعات',
			openPreviousRelease: 'فتح الإصدار السابق',
			proceed: 'متابعة',
			remove: 'إزالة',
			renew: 'تجديد',
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
			signIn: 'سجّل الدخول',
			signOut: 'تسجيل الخروج',
			sortBy: 'ترتيب حسب',
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
			refused: 'رُفض هذا الطلب ولم يتغيّر شيء.',
			timedOut: 'استغرقت العملية وقتاً طويلاً وتوقفت.'
		},

		export: {
			description: 'إلى أي ملف يتحول هذا؟',
			nothingToExport: 'لا شيء هنا للتصدير'
		},

		failures: {
			forbidden: 'دورك لا يسمح بهذا في مساحة العمل هذه.',
			invalidInput: 'بعض ما أُدخل غير صالح. راجعه وحاول مرة أخرى.',
			signedOut: 'سجّل الدخول للقيام بهذا.'
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
				'لا تحمل ورقة {sheet} العمود {columns}، فلا تطابق صفوفها إلا سجلات موجودة هنا.',
			sheetCollision: 'الصفان {rows} في ورقة {sheet} يدّعيان {identity} معًا. احذف أحدهما لتستورد.',
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
			contractStatus: 'حالة العقد',
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
			noMatch: 'لا يوجد ما يطابق',
			recordNotFound: 'هذا السجل غير موجود',
			recordNotFoundDescription: 'ربما حُذف.',
			unexpectedError: 'حدث خطأ غير متوقع!',
			unknown: 'غير معروف'
		},

		nav: {
			account: 'الحساب',
			complexes: 'المجمعات',
			contracts: 'العقود',
			dashboard: 'لوحة التحكم',
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

		refusals: {
			complex: {
				gone: 'لم يعد هذا المجمع موجوداً في مساحة العمل. أعد التحميل لترى ما تغيّر.',
				holdsUnits: 'ما زال هذا المجمع يضم وحدات. احذفها قبل حذفه.',
				nameTaken: 'الاسم مرتبط بمجمع مسجل مسبقاً.',
				nameTakenNamed: 'الاسم {named} مرتبط بمجمع مسجل مسبقاً.',
				repeatedInSet: 'مجمعان في هذه المجموعة يطالبان بـ {value}.'
			},
			contract: {
				costNotPositive: 'يجب أن تكون تكلفة الدفعة أكبر من صفر.',
				endBeforeStart: 'يجب أن يكون تاريخ النهاية بعد تاريخ البداية.',
				govIdTaken: 'المعرف الحكومي مرتبط بعقد آخر.',
				govIdTakenNamed: 'المعرف الحكومي {named} مرتبط بعقد آخر.',
				holdsPayments: 'لهذا العقد دفعات. احذفها قبل حذفه.',
				holdsUnits: 'ما زال هذا العقد يضم وحدات. أزلها قبل حذفه.',
				missing: 'لم يعد هذا العقد موجوداً في مساحة العمل. أعد التحميل لترى ما تغيّر.',
				notTerminable: 'لا يُنهى إلا العقد الساري أو المكتمل أو المنقضي.',
				notUnterminable: 'لا يُستعاد إلا العقد المنتهي.',
				paidInFull: 'سُدد هذا العقد بالكامل ولا يقبل دفعات أخرى.',
				periodOffCycle:
					'يجب أن يبقى تاريخ النهاية ضمن {days} أيام قبل أو بعد تاريخ نهاية دورة {interval} المحسوب.',
				periodOverlapsUnits:
					'يحتفظ عقد آخر بواحدة أو أكثر من هذه الوحدات خلال التواريخ الجديدة. اختر تواريخ أخرى.',
				renewalBeforeEnd: 'يجب أن يبدأ التجديد بعد انتهاء العقد الذي يجدده.',
				repeatedInSet: 'عقدان في هذه المجموعة يطالبان بـ {value}.',
				tenantMissing: 'لم يعد المستأجر المختار موجوداً في مساحة العمل. اختر مستأجراً آخر.',
				tenantMissingNamed: 'لا يوجد في مساحة العمل مستأجر بالمعرف {named}.',
				terminatedLocked: 'هذا العقد منتهٍ ومقفل. استعده قبل تعديله.',
				unitsLockedByPayments: 'لا يمكن تغيير وحدات العقد بعد تسجيل دفعات عليه.',
				unitsMissing:
					'لم تعد واحدة أو أكثر من هذه الوحدات موجودة في مساحة العمل. أعد التحميل لترى ما تغيّر.',
				unitsTaken:
					'يحتفظ عقد آخر بواحدة أو أكثر من الوحدات المختارة خلال هذه المدة. اختر وحدات أخرى أو مدة أخرى.',
				unitsUnavailable:
					'يحتفظ عقد آخر بواحدة أو أكثر من هذه الوحدات خلال المدة المحددة. اختر مدة أخرى.'
			},
			host: {
				lapsed: 'انتهت صلاحية هذا الرابط. اطلب رابطاً جديداً ممن أرسله إليك.',
				consumed: 'استُخدم هذا الرابط من قبل. اطلب رابطاً جديداً ممن أرسله إليك.',
				revoked: 'سُحب هذا الرابط. اطلب رابطاً جديداً ممن أرسله إليك.',
				replaced: 'حلّ محل هذا الرابط رابط أحدث. اطلب الرابط الجديد ممن أرسله إليك.',
				codeMissing: 'اكتب الرمز المكوّن من ستة أحرف الذي وصلك مع الرابط.',
				codeWrong: 'الرمز غير صحيح. اطلب ممن أرسل الرابط أن يقرأه عليك مرة أخرى.',
				linkUnreadable: 'هذا ليس رابط انضمام إلى rentable. انسخ الرابط كاملاً وحاول مرة أخرى.',
				linkNotAnInvitation:
					'هذا الرابط يربط جهازاً آخر ولا يحمل دعوة. سجّل الدخول باسم المستخدم وكلمة المرور بدلاً من ذلك.',
				linkNotForAMachine: 'هذا الرابط دعوة وليس رابطاً لجهاز آخر. افتحه حيث تُقبل الدعوات.',
				anotherOrganizationHeld: 'يحمل هذا الجهاز مؤسسة أخرى بالفعل. افصلها أولاً.',
				credentialsWrong: 'اسم المستخدم أو كلمة المرور غير صحيحة.',
				passwordTooShort: 'تحتاج كلمة المرور إلى 12 حرفاً على الأقل.',
				passwordChangeRequired: 'غيّر كلمة المرور قبل أي شيء آخر.',
				signedOut: 'لا أحد مسجّل الدخول على هذا الجهاز. سجّل الدخول وحاول مرة أخرى.',
				noOrganization: 'لا يحمل هذا الجهاز أي مؤسسة بعد.',
				noMemberYet: 'لم يسجّل أحد الدخول إلى المؤسسة على هذا الجهاز بعد. سجّل الدخول أولاً.',
				signInAgain: 'لم يعد حسابك على هذا الجهاز محدّثاً. سجّل الدخول مرة أخرى.',
				youWereRemoved: 'أُزلت من هذه المؤسسة.',
				sessionsEnded: 'أُنهيت جلساتك من جهاز آخر. سجّل الدخول مرة أخرى.',
				keyNotInForce: 'سُلّمت المؤسسة إلى مالك جديد، فلا يستطيع القيام بهذا سواه.',
				usernameInvalid:
					'يتكوّن اسم المستخدم من 3 إلى 32 من الحروف أو الأرقام أو النقاط أو الشرطات السفلية أو الشرطات، دون مسافات.',
				usernameTaken: 'اسم المستخدم هذا مأخوذ في هذه المؤسسة. اختر اسماً آخر.',
				roleUnknown: 'اختر مديراً أو عضواً.',
				memberMissing: 'لم يعد هذا العضو في هذه المؤسسة. أعد التحميل لترى ما تغيّر.',
				memberGone: 'لم يعد هذا الحساب في المؤسسة.',
				memberRemoved: 'أُزيل هذا العضو. أنشئ له حساباً من جديد إن كان سيعود.',
				notYourself: 'لا يمكنك القيام بهذا على حسابك أنت. يستطيع ذلك مدير آخر.',
				ownerProtected: 'لا يُغيَّر حساب المالك بهذه الطريقة، فالمؤسسة ملكه.',
				ownerOnly: 'لا يقوم بهذا إلا المالك. اطلبه منه.',
				ownerMachineOnly: 'يحتاج هذا إلى حساب Turso المتصل بجهاز المالك. اطلبه من المالك.',
				roleLacksAct: 'لا يشمل دورك هذا الإجراء. اطلبه من أحد المديرين.',
				notAdministrator: 'لا يقوم بهذا إلا مدير.',
				alreadyOwner: 'أنت المالك بالفعل. اختر الحساب الذي ستنتقل إليه المؤسسة.',
				accountNotSetUp:
					'ليست لهذا الحساب كلمة مرور خاصة به بعد. بعد أن يفتح صاحبه رابطه ويختار واحدة، اعرض عليه المؤسسة مرة أخرى.',
				offerPending: 'المؤسسة معروضة على حساب بالفعل. اسحب ذلك العرض أولاً.',
				offerAccepted: 'قُبل العرض بالفعل وأصبحت المؤسسة ملكه الآن. لم يتغيّر شيء.',
				nothingOffered: 'لا يوجد عرض قائم لهذه المؤسسة.',
				offererGone: 'لم يعد الحساب الذي عرض عليك المؤسسة موجوداً فيها.',
				organizationNameMissing: 'تحتاج المؤسسة إلى اسم.',
				workspaceNameMissing: 'تحتاج مساحة العمل إلى اسم.',
				workspaceMissing: 'لم تعد مساحة العمل هذه في المؤسسة. أعد التحميل لترى ما تغيّر.',
				noWorkspaceOpen: 'لا توجد مساحة عمل مفتوحة على هذا الجهاز. افتح واحدة وحاول مرة أخرى.',
				noGrant: 'ليست لديك صلاحية على مساحة العمل هذه.',
				grantMissing: 'ليست لهذا العضو صلاحية على مساحة العمل هذه.',
				grantBeyondOwn: 'لا يمكنك مشاركة مساحة عمل إلا إذا كانت لديك صلاحية كاملة عليها.',
				noOrganizationCredential:
					'لا يملك هذا الجهاز صلاحية الوصول إلى سجلات المؤسسة. سجّل الدخول مرة أخرى وأعد المحاولة.',
				workspaceNewer: 'رقّى إصدار أحدث من rentable مساحة العمل هذه. حدّث rentable لتفتحها.',
				workspaceBehind:
					'تحتاج مساحة العمل هذه إلى ترقية، وصلاحية القراءة وحدها لا تكفي لذلك. اطلب من عضو بصلاحية كاملة أن يفتحها مرة واحدة.',
				databaseRefused: 'رفضت قاعدة البيانات الطلب ولم يتغيّر شيء. حاول مرة أخرى لاحقاً.',
				tursoNotConnected: 'هذا الجهاز غير متصل بحساب Turso. اربطه وحاول مرة أخرى.',
				consentNeededAgain: 'تحتاج Turso إلى منح الموافقة من جديد. اربط حساب Turso مرة أخرى.',
				consentGone: 'لم تعد هذه الموافقة قيد الانتظار. ابدأها من جديد.',
				groupMismatch:
					'ليست هذه المجموعة التي مُنحت الموافقة عليها. تحقّق من الاسم وحاول مرة أخرى.',
				groupNeeded: 'تحتاج Turso إلى اسم المجموعة التي اخترتها. اكتبه أدناه.',
				groupHoldsOrganization:
					'تحمل هذه المجموعة مؤسسة بالفعل. اختر مجموعة أخرى أو حساب Turso آخر.',
				groupEmpty:
					'مُنحت الموافقة على مجموعة لا تحمل أي مؤسسة. امنحها على المجموعة التي تحمل مؤسستك.',
				nothingToConnectTo: 'لا يحمل حساب Turso هذا أي مؤسسة للاتصال بها. عد وأنشئ واحدة.',
				createRefused: 'لم تُنشئ Turso قاعدة بيانات المؤسسة.',
				tursoRefused: 'رفضت Turso الطلب. لن تفيد إعادة المحاولة.',
				tursoAccountRefused: 'رفضت Turso الطلب بسبب الحساب نفسه. راجع خطة الحساب في Turso.'
			},
			payment: {
				amountNotPositive: 'يجب أن يكون مبلغ الدفعة أكبر من صفر.',
				datedInFuture: 'لا يمكن أن يكون تاريخ الدفعة في المستقبل.',
				missing: 'لم تعد هذه الدفعة موجودة في مساحة العمل. أعد التحميل لترى ما تغيّر.',
				repeatedInSet: 'دفعتان في هذه المجموعة تطالبان بـ {value}.'
			},
			record: {
				idTaken: 'هناك سجل آخر يحمل هذا المعرف.',
				idTakenNamed: 'هناك سجل آخر يحمل المعرف {named}.'
			},
			tenant: {
				gone: 'لم يعد هذا المستأجر موجوداً في مساحة العمل. أعد التحميل لترى ما تغيّر.',
				holdsContracts: 'هناك عقود تذكر هذا المستأجر، فلا يمكن حذفه.',
				nationalIdTaken: 'الهوية الوطنية مرتبطة بمستأجر مسجل.',
				nationalIdTakenNamed: 'الهوية الوطنية {named} مرتبطة بمستأجر مسجل.',
				phoneTaken: 'رقم الهاتف مرتبط بمستأجر مسجل.',
				phoneTakenNamed: 'رقم الهاتف {named} مرتبط بمستأجر مسجل.',
				repeatedInSet: 'مستأجران في هذه المجموعة يطالبان بـ {value}.'
			},
			unit: {
				gone: 'لم تعد هذه الوحدة موجودة في مساحة العمل. أعد التحميل لترى ما تغيّر.',
				holdsContracts: 'هناك عقد يذكر هذه الوحدة، فلا يمكن حذفها.',
				nameRepeated: 'الاسم {name} مكرر؛ لكل وحدة اسمها الخاص.',
				nameTaken: 'الاسم مرتبط بوحدة في نفس المجمع.',
				nameTakenNamed: 'الاسم {named} مرتبط بوحدة في نفس المجمع.',
				repeatedInSet: 'وحدتان في هذه المجموعة تطالبان بـ {value}.'
			},
			workspace: {
				nothingToImport: 'لا يوجد ما يمكن استيراده.',
				unknownComplex: 'يذكر الملف مجمعاً باسم {name}، ولا يوجد مجمع بهذا الاسم.',
				unknownContract: 'يذكر الملف عقداً باسم {name}، ولا يوجد عقد بهذا الاسم.',
				unknownTenant: 'يذكر الملف مستأجراً باسم {name}، ولا يوجد مستأجر بهذا الاسم.',
				unknownUnit: 'يذكر الملف وحدة باسم {name}، ولا توجد وحدة بهذا الاسم.'
			}
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
			lasts: 'يمكنك التراجع عن هذا ما دام التطبيق مفتوحًا.',
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
			commandPaletteActDoesNotApply: 'لا ينطبق «{act}» على {record}.',
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
			nothingToCreateHere: 'لا شيء في هذه الشاشة يقبل سجلاً جديداً',
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
			description: 'لا يمكن التراجع عن هذا.',
			unnamedRecord: 'هذا السجل'
		}
	},
	layout: {
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
		},

		accountMenu: {
			signedOutHint: 'غير مسجل الدخول',
			signedOutName: 'مستخدم'
		},

		workspaceMenu: {
			create: 'مساحة عمل جديدة',
			locked: 'غير متاح',
			members: '{count|number} عضو',
			switchTo: 'التبديل إلى',
			open: 'مفتوحة',
			workspaceRefusedAuthority:
				'إنشاء مساحة عمل يحتاج إلى حساب Turso. أعد ربطه من الإعدادات، في قسم المؤسسة.'
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
			noOrganizationSubtitle: 'لا مؤسسة على هذا الجهاز بعد.',
			subtitle: 'سجّل الدخول للمتابعة',
			help: 'تواجه صعوبة في تسجيل الدخول؟',
			username: 'اسم المستخدم',
			password: 'كلمة المرور',
			unlocking: 'يجري تسجيل دخولك. يستغرق هذا لحظة عن قصد.',
			roleOwner: 'مالك',
			roleAdministrator: 'مدير',
			roleMember: 'عضو',
			setUp: 'استعمل حساب Turso الخاص بك',
			setUpDescription: 'أنت مالك المؤسسة.',
			connectByLink: 'استعمل رابطًا ورمزًا',
			connectByLinkDescription: 'سُلّم إليك رابط ورمز.',
			signedOutElsewhere: 'سُجّل خروجك من هذا الجهاز من جهاز آخر. سجّل الدخول مجددًا للمتابعة.',
			useALink: 'افتح رابطًا لديك',
			disconnect: 'افصل هذا الجهاز',
			disconnectDescription:
				'يحذف هذا الجهاز نسخته من المؤسسة ومساحات عملها، وينسى حساب Turso. لا يتغير شيء على Turso. يعيد المالك الربط بحساب Turso الخاص به، ويحتاج غيره إلى رابط جديد.'
		},

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
			seeAll: 'عرض الكل ({count|number})'
		},

		title: 'لوحة التحكم'
	},

	settings: {
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
	},
	complexes: {
		empty: {
			description: 'ستظهر هنا المجمعات التي تضيفها مع وحداتها.',
			title: 'لا توجد مجمعات بعد'
		},

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
			duplicateUnitName: '{name} موجود في القائمة بالفعل.',
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
			emptyDescription: 'ستظهر هنا الوحدات التي تضيفها إلى هذا المجمع.',
			emptyTitle: 'لا توجد وحدات في هذا المجمع بعد',
			management: 'إدارة الوحدات'
		}
	},

	tenants: {
		empty: {
			description: 'سيظهر هنا المستأجرون الذين تضيفهم.',
			title: 'لا يوجد مستأجرون بعد'
		},

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
		empty: {
			description: 'ستظهر هنا العقود التي تنشئها، وأولها ما يحتاج إلى متابعة.',
			title: 'لا توجد عقود بعد'
		},

		form: {
			startDate: 'تاريخ البداية',
			calculatedEndDate: 'تاريخ النهاية المحسوب',
			calculatedEndDateHint:
				'يتبع الدورة وتاريخ البداية وعدد الدورات. يمكن تحريكه حتى {days} أيام قبله أو بعده، والتواريخ المسموح بها خضراء.',
			costDecimalPlaces: 'تقبل التكلفة منزلتين عشريتين كحد أقصى.',
			costGreaterThanZero: 'يجب أن تكون التكلفة أكبر من صفر.',
			costRequired: 'التكلفة مطلوبة.',
			cyclesGreaterThanZero: 'يجب أن يكون عدد الدورات أكبر من صفر.',
			cyclesRequired: 'عدد الدورات مطلوب.',
			endDateRequired: 'تاريخ النهاية مطلوب.',
			endDateShort: 'تاريخ النهاية',
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
			searchAndSelectTenant: 'ابحث واختر مستأجر',
			searchTenantPlaceholder: 'ابحث عن مستأجر بالاسم أو الهوية أو الهاتف...',
			startDateRequired: 'تاريخ البداية مطلوب.',
			tenantRequired: 'المستأجر مطلوب.',
			chooseUnits: 'اختر الوحدات',
			loadingUnits: 'جاري تحميل الوحدات...',
			noUnitFree: 'لا توجد وحدة متاحة خلال هذه المدة.',
			searchUnitPlaceholder: 'ابحث عن وحدة بالاسم أو المجمع...',
			unitHeldOverTerm: 'يشغلها عقد آخر خلال هذه المدة',
			unitsHint:
				'تُعرض الوحدات المتاحة خلال مدة العقد فقط. يمكنك تغييرها لاحقاً من تبويب الوحدات في العقد.',
			unitsNeedTerm: 'اختر تاريخ البداية أولاً لتظهر الوحدات المتاحة خلال المدة.',
			unitsOptional: 'الوحدات (اختياري)'
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
			emptyTitle: 'لا توجد دفعات بعد',
			fullyPaidNotice: 'هذا العقد مسدد بالكامل',
			fullyPaidSummary: 'تم سداد العقد بالكامل.',
			monthTotal: 'الإجمالي المعروض في {month}',
			percentFulfilled: '{percent}% مكتمل',
			remaining: 'متبقٍ {amount}',
			remainingAfter: 'المتبقي بعد هذه الدفعة',
			remainingBalance: 'الرصيد المتبقي',
			terminatedNotice: 'هذا العقد منتهي',
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
				'انقل الوحدة بين الجانبين، ويُحفظ كل نقل فورًا. لا تظهر الوحدات المرتبطة بعقد متداخل المدة.',

			lockNoticeHasPayments: 'للعقد دفعات مسجلة، فوحداته مقفلة.',
			lockNoticeTerminated: 'العقد منتهٍ، فوحداته مقفلة.',

			noAssignedUnits: 'لا توجد وحدات مرتبطة.',
			noAvailableUnits: 'لا توجد وحدات متاحة.'
		}
	},

	settingsHooks: {
		endingSoonUpdated: 'تم تحديث فترة الإشعار!',
		workspaceUpToDate: 'كل شيء محدّث.'
	},

	organization: {
		setup: {
			connectTitle: 'اربط حساب Turso الخاص بك',
			connectDescription: 'تقيم مؤسستك على حساب Turso الخاص بك.',
			connectDetails: 'قبل أن تربط',
			position: 'الخطوة {step|number} من {total|number}',
			groupCoverage: 'تشمل الموافقة كل قاعدة بيانات في المجموعة التي تختارها، ولا شيء خارجها.',
			oneOrganization:
				'تحمل المجموعة الواحدة مؤسسة واحدة، وإن كانت تحمل واحدة بالفعل فالاتصال بها هو ما يحدث، لا الرفض.',
			accountCreation:
				'حساب Turso المجاني أو Developer يحمل مجموعة واحدة، فخصّص حسابًا لـ rentable وحده. وفي الحساب المدفوع اختر مجموعة فارغة.',
			succession:
				'لا يمنح الصلاحية مجددًا إلا أنت أو مدير منظمة Turso، وتستطيع Turso نقل المجموعة. لا يفعل rentable أيًا منهما.',
			groupAskedOnce:
				'المجموعة التي لا تحمل شيئاً بعد يطلب rentable اسمها مرة واحدة في الخطوة التالية، فـ Turso لا تذكر هذا الاسم في أي مكان يصل إليه.',
			openDashboard: 'افتح لوحة تحكم Turso',
			connect: 'اربط حساب Turso',
			connecting: 'أكمل الموافقة في نافذة المتصفح التي فُتحت للتو.',
			connected: 'تم ربط حساب Turso.',
			consentAbandoned: 'لم تُمنح الموافقة. لم يُنشأ شيء.',
			consentFailed: 'رفضت Turso الموافقة.',
			existingTitle: 'ادخل إلى مؤسستك',
			existingDescription:
				'حساب Turso هذا يحمل مؤسسة بالفعل. يدخل مالكها هنا فينضم هذا الجهاز إليها.',
			existingConnect: 'اربط هذا الجهاز',
			existingConnecting: 'يجري ربط هذا الجهاز...',
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
			groupNeeded: 'لم تعرف rentable من Turso أي مجموعة تقصد، فاكتب اسمها هنا مرة واحدة.',
			groupLabel: 'مجموعة Turso',
			groupDescription: 'الاسم كما يظهر في شاشة موافقة Turso. قاعدة بيانات المؤسسة تسكن فيها.',
			groupRequired: 'اكتب اسم المجموعة التي حدّدتها في شاشة موافقة Turso.',
			create: 'أنشئ المؤسسة',
			creating: 'يجري إنشاء المؤسسة على حساب Turso الخاص بك...',
			copyLink: 'انسخ الرابط',
			linkCopied: 'تم نسخ الرابط.',
			continue: 'متابعة',
			back: 'رجوع'
		},
		join: {
			title: 'الربط برابط',
			description: 'الصق الرابط واكتب الرمز الذي رافقه.',
			linkLabel: 'الرابط',
			reading: 'تجري قراءة الرابط...',
			unreadable: 'هذا ليس رابطًا من rentable. الصق الرابط كاملاً كما سُلّم إليك تمامًا.',
			unreachable: 'تعذّر الوصول إلى المؤسسة. تحقّق من الاتصال وحاول مجددًا.',
			lapsed: 'انتهت صلاحية هذا الرابط. اطلب رابطًا جديدًا ممن أرسله إليك.',
			consumed: 'سبق استخدام هذا الرابط هنا. سجّل الدخول بكلمة المرور التي اخترتها.',
			consumedElsewhere: 'سبق استخدام هذا الرابط. اطلب رابطًا جديدًا ممن أرسله إليك.',
			revoked: 'سُحب هذا الرابط. اطلب رابطًا جديدًا ممن أرسله إليك.',
			replaced: 'حلّ رابط أحدث محل هذا الرابط. اطلب الرابط الجديد ممن أرسله إليك.',
			anotherOrganization: 'هذا الجهاز مرتبط بمؤسسة أخرى. افصله عنها من شاشة تسجيل الدخول أولًا.',
			toSignIn: 'انتقل إلى تسجيل الدخول',
			passwordTitle: 'اختر كلمة مرورك',
			passwordDescription:
				'تسجّل بها دخولك على أي جهاز. لا أحد يستطيع استعادتها، والرابط الجديد وحده يعيدك.',
			organizationLabel: 'المؤسسة',
			codeLabel: 'الرمز',
			codeDescription: 'الأحرف الستة التي أُمليت عليك مع الرابط.',
			codeWrong: 'الرمز خاطئ. اطلب ممن أرسل إليك الرابط أن يمليه عليك مجددًا.',
			codeMissing: 'اكتب الأحرف الستة التي رافقت الرابط.',
			confirmLabel: 'كلمة مرورك مجددًا',
			mismatch: 'الكلمتان غير متطابقتين.',
			tryAgain: 'حاول مجددًا',
			back: 'رجوع'
		},
		standing: {
			title: 'هذا الجهاز وTurso',
			purpose:
				'المؤسسة محفوظة على Turso وتصل إلى هذا الجهاز تلقائيًا. ما تكتبه يُرسل حين يمكن الوصول إلى Turso.',
			notYetReached: 'لم يصل هذا الجهاز إلى Turso بعد',
			upToDateChecked: 'كل شيء محدّث، آخر فحص {moment}',
			lastReached: 'آخر وصول إلى Turso في {moment}',
			accountNeedsAttention: 'حساب Turso يحتاج إلى عناية',
			accessNeedsAttention: 'صلاحية وصول هذا الجهاز تحتاج إلى عناية',
			needsReconnecting: 'هذا الجهاز يحتاج إلى إعادة ربط',
			reconnectBelow: 'يُعاد ربط حساب Turso من القسم أدناه.',
			checkNow: 'زامن',
			checking: 'جارية المزامنة...'
		},
		dashboard: {
			membersTitle: 'الأعضاء',
			membersDescription: 'كل من في المؤسسة. الأعضاء يُنشأون ويُغيّرون من هنا.',
			workspacesDescription: 'كل مساحات عمل المؤسسة. مساحات العمل تُنشأ وتُغيّر من هنا.',
			standingNoPassword: 'لا كلمة مرور بعد',
			standingNoMachine: 'لا جهاز مسجّل الدخول',
			standingSignedIn: 'مسجّل الدخول على جهاز',

			memberTitle: 'عضو جديد',
			memberDescription:
				'اسم المستخدم والدور ومساحات العمل التي يحملها. لا كلمة مرور له حتى يفتح رابطًا تصنعه له.',
			role: 'الدور',
			administratorsAreTheOwners: 'المالك وحده يستطيع جعل أحد مديرًا.',
			noWorkspaceToGrant: 'لا مساحة عمل لمنحها بعد. يمكن منحهم واحدة لاحقًا.',
			addMember: 'أضف عضوًا',
			cannotSend:
				'rentable لا يرسل شيئًا: انسخ الرابط أدناه وسلّمه، وأعطِ الرمز على حدة. يعمل مرة واحدة.',
			linkTitle: 'الرابط والرمز',
			codeTitle: 'رمز التأكيد',
			codeDescription:
				'أملِ هذا الرمز في مكالمة أو وجهًا لوجه. إنه النصف الآخر مما يحتاجه الرابط، فلا يُرسل أبدًا معه.',
			done: 'تم',
			invitationExpires: 'تنتهي صلاحية الرابط في {date}',
			makeLink: 'اصنع رابطًا',
			transferOwnership: 'سلّم الملكية',
			transferOwnershipGoes: 'يُعرض عليه أخذ المؤسسة. فإذا قبل، صار هو المالك وصرت أنت مديرًا.',
			transferOwnershipMember: 'من يُعرض عليه',
			transferOwnershipAuthority:
				'يبقى حساب Turso وقواعد بياناته معك. ويصل المالك الجديد حسابه قبل أن ينشئ مساحات عمل.',
			transferOwnershipConfirm: 'اعرضها',
			ownershipOffered: 'عُرضت المؤسسة. يقبلها من جهاز له هو.',
			withdrawOffer: 'اسحب العرض',
			ownershipOfferWithdrawn: 'سُحب العرض. لم تنتقل الملكية.',
			acceptOwnership: 'اقبل الملكية',
			acceptOwnershipGoes:
				'تصير مالك {organization} ويصير {owner} مديرًا، وتُوقَّع المؤسسة بكلمة مرورك من الآن.',
			acceptOwnershipAuthority:
				'يبقى حساب Turso مع من وصله. صِل حسابك من قسم المؤسسة لتنشئ مساحات العمل.',
			acceptOwnershipConfirm: 'اقبلها',
			ownershipAccepted: 'صارت المؤسسة لك. أنت المالك الآن.',
			lockOut: 'احظر',
			unsetPassword: 'أعد تعيين كلمة المرور',
			passwordUnset: 'أُلغيت كلمة مروره. اصنع له رابطًا ليختار كلمة مرور جديدة.',
			endSessions: 'سجّل خروجه من كل جهاز',
			sessionsEnded: 'سُجّل خروجه من كل جهاز.',
			sessionsEndedPending: 'هذا الجهاز غير متصل؛ سيصل تسجيل الخروج إلى أجهزته عند عودة الاتصال.',
			rename: 'غيّر الاسم',
			renameDescription:
				'اسم المستخدم الذي يسجل به الدخول على كل جهاز. لا شيء يخبره بأنه تغيّر؛ أخبره بنفسك.',
			username: 'اسم المستخدم',
			usernameRules:
				'اسم المستخدم من ثلاثة إلى اثنين وثلاثين حرفًا من الحروف والأرقام والنقاط والشرطات السفلية والشرطات',
			renamed: 'غُيّر اسم العضو.',
			authorityTitle: 'حساب Turso',
			authorityDescription:
				'لا يحمل هذا الجهاز صلاحية على حساب Turso، ولا يمكن استعادتها. امنح الموافقة مجددًا.',
			authorityFollowsTheAccount: 'الصلاحية تتبع حساب Turso الذي منحها، لا من يملك المؤسسة.',
			authorityReconnected: 'حساب Turso متصل على هذا الجهاز.',
			remove: 'أزل',
			removeDescription:
				'ينتهي وصوله حين تنتهي صلاحية اعتماده، خلال أربعة أسابيع. لا يتأثر أحد غيره.',
			removeAndLockOut: 'أزل واحظر',
			lockOutReading: 'تجري قراءة مساحات العمل التي يمسّها هذا...',
			lockOutDescription:
				'ينتهي وصوله إلى {workspaces} الآن، ويتوقف {count|number} من الأعضاء الآخرين فيها عن المزامنة حتى يعيد تطبيقهم الاتصال.',
			removed: 'أُزيل العضو. ينتهي وصوله حين تنتهي صلاحية اعتماده.',
			lockedOut: 'حُظر العضو. يعيد {count|number} من الأعضاء الآخرين الاتصال من تلقاء أنفسهم.',
			unreachableWorkspaces:
				'أنت لا تملك {workspaces}، لذا لم تستطع إعادة التعيين استعادتها. يمكن لمدير يملكها منحها مجددًا.',
			linkUnreachableWorkspaces:
				'أنت لا تملك {workspaces}، لذا لم يستطع الرابط نقلها. يمكن لمدير يملكها منحها مجددًا.',
			noWorkspaces: 'لا مساحة عمل بعد.',
			workspacesHeld: '{count|number} {{مساحة عمل|مساحات عمل}}',
			accessFull: 'وصول كامل',
			accessReadOnly: 'قراءة فقط',
			accessNone: 'لا وصول',
			accessTakenBack: 'سحب مساحة عمل لا يصدر شيئًا، فما يحمله الآن يعمل حتى تنتهي صلاحيته.',
			accessSaved: 'حُفظت مساحات العمل.',
			workspaceAccessTitle: 'الأعضاء والوصول',
			workspaceAccessDescription:
				'من يحمل {workspace} وما يستطيع كل منهم فعله فيها. الوصول المسحوب يبقى حتى تنتهي صلاحيته.',
			deleteWorkspace: 'احذف مساحة العمل',
			deleteWorkspaceDescription:
				'تُحذف مساحة العمل وكل سجل فيها من Turso ومن كل جهاز يزامنها. لا شيء يعيدها.',
			workspaceDeleted: 'حُذفت مساحة العمل.',
			transferTitle: 'تصدير واستيراد {workspace}',
			forgetAccount: 'انسَ حساب Turso',
			readOnlyIsTheOwners: 'المالك وحده يمنح وصول القراءة فقط، من جهازه هو.',
			memberSheetDescription: 'ما يستطيع {username} فعله في هذه المؤسسة.',
			beyondRole: 'خارج دوره',
			beyondRoleDescription: 'ما يستطيع هذا العضو فعله مما لا يستطيعه العضو عادة.',
			beyondRoleNone: 'لا شيء خارج دوره.',
			beyondRoleAdd: 'اسمح له بشيء آخر',
			allowActs: 'اسمح',
			administratorAllowedEvery: 'المدير يستطيع كل ذلك أصلًا.',
			permissionsLegend: 'ما يستطيع فعله',
			actInviteMember: 'دعوة الأعضاء',
			actRemoveMember: 'إزالة الأعضاء',
			actChangeRole: 'تغيير الأدوار والصلاحيات',
			actRenameWorkspace: 'تغيير أسماء مساحات العمل',
			actResetPassword: 'إصدار روابط جديدة',
			actRenameMember: 'تغيير أسماء الأعضاء',
			actGrantWorkspace: 'منح مساحات العمل',
			signingIsTheOwners: 'المالك وحده يمنح أحدًا فعلًا يكتب في صف عضو آخر. أما سحب فعل فهو لك.',
			roleChanged: 'حُفظ الدور والصلاحيات.',
			leavingTitle: 'المغادرة',
			disconnectForgets: 'يسجّل خروجك ويحذف نسخة المؤسسة من هذا الجهاز. لا يتغير شيء على Turso.',
			disconnect: 'افصل',
			disconnected: 'لم يعد هذا الجهاز يحتفظ بالمؤسسة.',
			forgetAccountDescription:
				'يحتفظ هذا الجهاز برمز لحساب Turso الخاص بالمؤسسة. إن نسيته، فلن يصل شيء من هنا إلى ذلك الحساب.',
			forgetAccountRevokes:
				'النسيان لا يلغي الرمز. أنهِ المنح بنفسك من لوحة تحكم Turso على app.turso.tech.',
			forgetAccountRevokesAt: 'app.turso.tech',
			accountForgotten: 'لم يعد هذا الجهاز يحتفظ برمز وصول إلى حساب Turso.',
			deleteOrganization: 'احذف المؤسسة',
			deleteOrganizationDescription:
				'تُحذف المؤسسة وكل مساحة عمل فيها من حساب Turso. لا شيء يعيدها.',
			deleteOrganizationGoes:
				'تُحذف كل مساحة عمل وكل سجل فيها، ويفقد كل عضو سبيل دخوله. لا شيء يعيد هذا.',
			organizationDeleted: 'حُذفت المؤسسة.'
		},

		roles: {
			owner: {
				who: 'يملك حساب Turso ويستطيع فعل أي شيء. المالك واحد، ولا يسلّم الملكية غيره.'
			},
			administrator: {
				who: 'يضيف الأعضاء ويصنع الروابط ويمنح مساحات العمل. أما حساب Turso فيبقى للمالك.'
			},
			member: {
				who: 'يعمل في مساحات العمل التي يحملها، ولا يغيّر شيئًا عن أحد غيره إلا أن تأذن له.'
			}
		},

		acts: {
			inviteMember: { does: 'يستطيع دعوة الأعضاء' },
			removeMember: { does: 'يستطيع إزالة الأعضاء' },
			changeRole: { does: 'يستطيع تغيير ما يفعله عضو آخر' },
			renameWorkspace: { does: 'يستطيع تغيير اسم مساحة عمل' },
			resetPassword: { does: 'يستطيع إعادة تعيين كلمة مرور عضو' },
			renameMember: { does: 'يستطيع تغيير أسماء الأعضاء' },
			grantWorkspace: { does: 'يستطيع منح عضو مساحة عمل' }
		},

		levels: {
			full: { does: 'يقرأ كل ما فيها ويكتب.' },
			readOnly: { does: 'يقرأها ولا يكتب فيها شيئًا.' },
			none: { does: 'لا يصل إليها أصلًا.' }
		},

		roleTable: {
			title: 'ما يستطيع كل دور فعله',
			description: 'الدور هو ما يُسمّى به المرء وما يبدأ به. وما عدا ذلك يُسمح به في صفحته هو.',
			given: 'ما يمكنك منحه لأحد',
			memberNote: 'العضو لا يبدأ بشيء من هذه، ويُسمح له بها في صفحته هو.',
			ownerAlone: 'للمالك وحده',
			ownerAloneReason: 'هذه تجري على حساب Turso الذي وصله المالك، فلا تُمنح لأحد.',
			allowed: 'نعم',
			notAllowed: 'لا',
			createWorkspace: 'ينشئ مساحة عمل جديدة.',
			deleteWorkspace: 'يحذف مساحة عمل وكل ما فيها.',
			lockOut: 'يقطع أحدهم عن كل مساحات العمل دفعة واحدة.',
			renew: 'يجدّد الاعتمادات التي تبقي الجميع على المزامنة.',
			tursoAccount: 'يصل حساب Turso، وينساه.'
		}
	},

	workspace: {
		nameTooLong: 'هذا الاسم طويل جداً.',
		nameRequired: 'أعطِ مساحة العمل اسماً.',
		renameDescription: 'اسم مساحة العمل هذه على كل جهاز مسجل الدخول إليها.',
		renamed: 'تمت إعادة تسمية مساحة العمل.',
		credentialRefused:
			'جُدّد وصولك وهذا الجهاز يجلبه. يستمر العمل هنا، وإن لم يُحَل الأمر فاسأل المالك.',
		accountRefusedMember:
			'حساب Turso الخاص بالمؤسسة يحتاج إلى اهتمام، فلا يصل شيء إلى Turso حاليًا. أخبر {owner}. يستمر العمل هنا.',
		accountRefusedOwner:
			'يرفض Turso حساب المؤسسة: {detail}. يستمر العمل هنا؛ أصلِح الأمر على app.turso.tech ليُرسَل.',
		accountRefusedOwnerNoDetail:
			'يرفض Turso حساب المؤسسة. يستمر العمل هنا؛ أصلِح الأمر على app.turso.tech ليُرسَل.',
		transferDescription:
			'اكتب كل السجلات في ملف واحد، أو اقرأ ملفًا كهذا. تشير السجلات إلى بعضها بالأسماء، فيفتح الملف على أي جهاز.'
	}
} satisfies Translation;

export default ar;
