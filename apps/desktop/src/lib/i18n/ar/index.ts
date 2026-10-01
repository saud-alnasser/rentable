import type { Translation } from '../i18n-types';
import * as complex from '../../complex/i18n/ar.js';
import * as unit from '../../complex/unit/i18n/ar.js';
import * as contract from '../../contract/i18n/ar.js';
import * as create from '../../create/i18n/ar.js';
import * as dashboard from '../../dashboard/i18n/ar.js';
import * as history from '../../history/i18n/ar.js';
import * as list from '../../list/i18n/ar.js';
import * as organization from '../../organization/i18n/ar.js';
import * as organizationSession from '../../organization/session/i18n/ar.js';
import * as palette from '../../palette/i18n/ar.js';
import * as payment from '../../payment/i18n/ar.js';
import * as permission from '../../permission/i18n/ar.js';
import * as print from '../../print/i18n/ar.js';
import * as settings from '../../settings/i18n/ar.js';
import * as shell from '../../shell/i18n/ar.js';
import * as shortcut from '../../shortcut/i18n/ar.js';
import * as startup from '../../startup/i18n/ar.js';
import * as tenant from '../../tenant/i18n/ar.js';
import * as transfer from '../../transfer/i18n/ar.js';
import * as undo from '../../undo/i18n/ar.js';
import * as workspace from '../../workspace/i18n/ar.js';

const ar = {
	app: {
		name: 'rentable'
	},
	common: {
		actions: {
			add: 'إضافة',
			cancel: 'إلغاء',
			clearSearch: 'مسح البحث',
			copyDetails: 'نسخ التفاصيل',
			details: 'التفاصيل',
			chooseFile: 'اختر ملفاً...',
			create: 'إنشاء',
			customizeColumns: 'تخصيص الأعمدة',
			delete: 'حذف',
			deleting: 'جاري الحذف...',
			duplicate: 'نسخة جديدة',
			edit: 'تعديل',
			export: 'تصدير',
			import: 'استيراد',
			...complex.common.actions,
			...contract.common.actions,
			...payment.common.actions,
			...settings.common.actions,
			...startup.common.actions,
			...tenant.common.actions,
			...unit.common.actions,
			openPayments: 'فتح المدفوعات',
			proceed: 'متابعة',
			remove: 'إزالة',
			restore: 'استعادة',
			rollback: 'التراجع',
			rollingBack: 'جاري التراجع...',
			save: 'حفظ',
			saveDatabasePath: 'حفظ مسار قاعدة البيانات',
			saveWindow: 'حفظ النافذة',
			saving: 'جاري الحفظ...',
			signIn: 'سجّل الدخول',
			update: 'تحديث',
			useDefaultPath: 'استخدام المسار الافتراضي',
			working: 'جاري العمل...',
			...list.common.actions,
			...organization.common.actions,
			...organizationSession.common.actions,
			...palette.common.actions,
			...shell.common.actions,
			...create.common.actions
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

		export: list.common.export,

		failures: {
			forbidden: 'دورك لا يسمح بهذا في مساحة العمل هذه.',
			invalidInput: 'بعض ما أُدخل غير صالح. راجعه وحاول مرة أخرى.',
			signedOut: 'سجّل الدخول للقيام بهذا.'
		},

		formats: {
			csv: 'csv',
			xlsx: 'مصنف إكسل'
		},

		import: transfer.common.import,

		history: history.common.history,

		labels: {
			...settings.common.labels,
			action: 'إجراء',
			activeContracts: 'العقود السارية',
			appVersion: 'إصدار التطبيق',
			complex: 'مجمع',
			contract: 'عقد',
			contractEnds: 'ينتهي العقد',
			contractNumber: 'رقم العقد',
			contractPeriod: 'مدة العقد',
			currentDatabasePath: 'مسار قاعدة البيانات الحالي',
			currentValue: 'القيمة الحالية',
			customDatabasePathOverride: 'تجاوز مسار قاعدة البيانات',
			defaultDatabasePath: 'مسار قاعدة البيانات الافتراضي',
			dueBalance: 'الرصيد المستحق',
			dueBalanceCoveredToDate: 'الرصيد المغطى حتى الآن',
			information: 'المعلومات',
			name: 'الاسم',
			nationalId: 'الهوية الوطنية',
			noticeWindowDays: 'فترة الإشعار (أيام)',
			paymentFulfillment: 'تحقق الدفع',
			phone: 'الهاتف',
			remainingDueBalance: 'الرصيد المتبقي',
			status: 'الحالة',
			tenant: 'المستأجر',
			units: 'وحدات',
			...list.common.labels,
			...payment.common.labels,
			...contract.common.labels,
			...complex.common.labels,
			...unit.common.labels
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

		periods: list.common.periods,

		permission: permission.common.permission,

		refusals: {
			complex: complex.refusals.complex,
			contract: contract.refusals.contract,
			host: {
				...organization.refusals.host,
				complexNeedsViewing:
					'إضافة المجمعات أو تعديلها أو حذفها يحتاج إلى عرضها. فعّل عرض المجمعات أولاً.',
				unitNeedsViewing:
					'إضافة الوحدات أو تعديلها أو حذفها يحتاج إلى عرضها. فعّل عرض الوحدات أولاً.',
				tenantNeedsViewing:
					'إضافة المستأجرين أو تعديلهم أو حذفهم يحتاج إلى عرضهم. فعّل عرض المستأجرين أولاً.',
				contractNeedsViewing:
					'إضافة العقود أو تعديلها أو حذفها يحتاج إلى عرضها. فعّل عرض العقود أولاً.',
				paymentNeedsViewing:
					'إضافة المدفوعات أو تعديلها أو حذفها يحتاج إلى عرضها. فعّل عرض المدفوعات أولاً.'
			},
			payment: payment.refusals.payment,
			record: {
				idTaken: 'هناك سجل آخر يحمل هذا المعرف.',
				idTakenNamed: 'هناك سجل آخر يحمل المعرف {named}.'
			},
			tenant: tenant.refusals.tenant,
			unit: unit.refusals.unit,
			workspace: workspace.refusals.workspace
		},

		selection: list.common.selection,

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

		table: list.common.table,

		time: {
			day: '{count} يوم',
			days: '{count} أيام'
		},

		undo: undo.common.undo,

		window: shell.common.window,

		ui: {
			breadcrumb: 'مسار التنقل',
			close: 'إغلاق',
			...palette.ui,
			...shortcut.ui,
			loading: 'جاري التحميل',
			mobileSidebarDescription: 'يعرض الشريط الجانبي للهاتف.',
			more: 'المزيد',
			morePages: 'صفحات أكثر',
			next: 'التالي',
			nextSlide: 'الشريحة التالية',
			...create.ui,
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
		notFound: shell.layout.notFound,
		error: shell.layout.error,
		workspaceMenu: workspace.layout.workspaceMenu,
		noWorkspace: workspace.layout.noWorkspace,
		signIn: organizationSession.layout.signIn,
		startup: startup.layout.startup
	},

	dashboard: dashboard.dashboard,

	settings: settings.settings,
	complexes: complex.complexes,

	tenants: tenant.tenants,

	contracts: { ...contract.contracts, payments: payment.payments },

	print: print.print,

	settingsHooks: settings.settingsHooks,

	organization: organization.organization,

	workspace: workspace.workspace,

	earlier: workspace.earlier
} satisfies Translation;

export default ar;
