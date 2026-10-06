// The contract feature's strings in arabic, composed back into `i18n/ar/index.ts` at `contracts`,
// `common.refusals.contract`, `common.actions` and `common.labels`. It imports nothing but types,
// because the typesafe-i18n generator transpiles it along with the locale. Each object satisfies
// its own slice of the generated types, so a key missing, left over or without its placeholder
// fails here.

import type { Translation } from '../../i18n/i18n-types';

export const contracts = {
	// a contract's card in a grid, whose facts are named fields: a count is the figure under its
	// field's name, so no plural agrees with it, and a field holding nothing says so in a word.
	// "none" agrees with the units and the payments, both feminine plurals.
	card: {
		cost: 'التكلفة · {interval}',
		none: 'لا توجد',
		paidOfExpected: 'المدفوع من المتوقع',
		paymentCount: '{count|number}',
		// the Arabic comma and a space, with no "و": the locale's own list format glues "و" to the
		// last name, which runs into a Latin name ("وRoom 10").
		unitSeparator: '، '
	},

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

	ranks: {
		dueSoon: 'يستحق قريبًا',
		endingSoon: 'قريب الانتهاء',
		overdue: 'متأخر',
		owing: 'مستحق'
	},

	reminder: {
		comingDue:
			'مرحبًا {tenant}، نذكّركم بأن إيجار العقد رقم {contract} بمبلغ {amount} ريال يحلّ في {date}. شكرًا لكم.',
		comingDueNoNumber:
			'مرحبًا {tenant}، نذكّركم بأن إيجار عقدكم بمبلغ {amount} ريال يحلّ في {date}. شكرًا لكم.',
		language: 'لغة الرسالة',
		noPhone: 'لا يوجد رقم جوال للمستأجر لإرسال التذكير إليه.',
		open: 'فتح واتساب',
		owed: 'مرحبًا {tenant}، نذكّركم بأن إيجار العقد رقم {contract} بمبلغ {amount} ريال مستحق منذ {date}. شكرًا لكم.',
		owedNoNumber:
			'مرحبًا {tenant}، نذكّركم بأن إيجار عقدكم بمبلغ {amount} ريال مستحق منذ {date}. شكرًا لكم.'
	},

	schedule: {
		columns: {
			amount: 'المبلغ المستحق',
			covered: 'المدفوع',
			due: 'تاريخ الاستحقاق',
			state: 'الحالة'
		},
		latePart: 'متأخرة؛ دُفع {covered} من {amount}',
		print: 'طباعة الجدول',
		printTitle: 'جدول الدفعات',
		stateDescriptions: {
			due: 'تستحق اليوم ولم تُدفع بالكامل',
			late: 'فات موعد استحقاقها ولم تُدفع بالكامل',
			paid: 'مدفوعة بالكامل',
			partlyPaid: 'لم يحن موعدها؛ دُفع جزء منها',
			upcoming: 'لم يحن موعدها؛ لم يُدفع منها شيء'
		},
		states: {
			due: 'مستحقة اليوم',
			late: 'متأخرة',
			paid: 'مدفوعة',
			partlyPaid: 'مدفوعة جزئياً',
			upcoming: 'قادمة'
		},
		title: 'جدول الدفعات'
	},

	selection: {
		deleteSummary: 'سيتم حذف {count|number} عقد',
		deleteTitle: 'حذف العقود',
		paymentDeleteSummary: 'سيتم حذف {count|number} دفعة',
		paymentDeleteTitle: 'حذف الدفعات',
		paymentRefusedContractTerminated: '{count|number} تخص عقداً منتهياً',
		paymentRefusedMissing: '{count|number} لم تعد موجودة في مساحة العمل',
		refusedHoldsPayments: '{count|number} ما زالت تحمل دفعات',
		refusedMissing: '{count|number} لم تعد موجودة في مساحة العمل',
		refusedNotRestorable: '{count|number} ليست منتهية',
		refusedNotTerminable: '{count|number} لا يمكن إنهاؤها يدوياً',
		refusedUnitsTaken: '{count|number} تشغل وحدة يشغلها الآن عقد آخر',
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
} satisfies Omit<Translation['contracts'], 'payments'>;

export const refusals = {
	contract: {
		costNotPositive: 'يجب أن تكون تكلفة الدفعة أكبر من صفر.',
		endBeforeStart: 'يجب أن يكون تاريخ النهاية بعد تاريخ البداية.',
		govIdTaken: 'المعرف الحكومي مرتبط بعقد آخر.',
		govIdTakenNamed: 'المعرف الحكومي {named} مرتبط بعقد آخر.',
		holdsPayments: 'لهذا العقد دفعات. احذفها قبل حذفه.',
		missing: 'لم يعد هذا العقد موجوداً في مساحة العمل. أعد التحميل لترى ما تغيّر.',
		notTerminable: 'لا يُنهى إلا العقد الساري أو المكتمل أو المنقضي.',
		nothingToRemind:
			'لا مستحقات على هذا العقد ولا إيجار يحلّ هذا الأسبوع، فلا شيء يُذكَّر به المستأجر.',
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
		unitRepeatedNamed: 'الوحدة {named} مذكورة مرتين في عقد واحد. اذكر كل وحدة مرة واحدة.',
		unitsMissing:
			'لم تعد واحدة أو أكثر من هذه الوحدات موجودة في مساحة العمل. أعد التحميل لترى ما تغيّر.',
		unitsTaken:
			'يحتفظ عقد آخر بواحدة أو أكثر من الوحدات المختارة خلال هذه المدة. اختر وحدات أخرى أو مدة أخرى.',
		unitsTakenNamed: 'يحتفظ عقد آخر بـ {named} خلال هذه التواريخ. حرّرها أولاً.',
		unitsUnavailable:
			'يحتفظ عقد آخر بواحدة أو أكثر من هذه الوحدات خلال المدة المحددة. اختر مدة أخرى.'
	}
} satisfies Pick<Translation['common']['refusals'], 'contract'>;

// the create control's label on this feature's list and the labels of its acts, composed back at
// `common.actions`, and the contract's field and column labels, at `common.labels`.
export const common = {
	actions: {
		newContract: 'عقد جديد',
		remind: 'تذكير المستأجر',
		unterminate: 'إلغاء الإنهاء',
		renew: 'تجديد',
		renewing: 'جاري التجديد...',
		restoring: 'جاري الاستعادة...',
		terminate: 'إنهاء',
		terminating: 'جاري الإنهاء...'
	},
	labels: {
		costPerPayment: 'التكلفة لكل دفعة',
		cycle: 'الدورة',
		end: 'النهاية',
		expected: 'المتوقع',
		governmentId: 'المعرف الحكومي',
		governmentIdOptional: 'المعرف الحكومي (اختياري)',
		paid: 'المدفوع',
		rank: 'الأولوية',
		start: 'البداية'
	}
} satisfies {
	actions: Pick<
		Translation['common']['actions'],
		| 'newContract'
		| 'remind'
		| 'unterminate'
		| 'renew'
		| 'renewing'
		| 'restoring'
		| 'terminate'
		| 'terminating'
	>;
	labels: Pick<
		Translation['common']['labels'],
		| 'costPerPayment'
		| 'cycle'
		| 'end'
		| 'expected'
		| 'governmentId'
		| 'governmentIdOptional'
		| 'paid'
		| 'rank'
		| 'start'
	>;
};
