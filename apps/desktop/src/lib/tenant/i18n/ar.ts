// The tenant feature's strings in arabic, composed back into `i18n/ar/index.ts` at `tenants`,
// `common.refusals.tenant` and `common.actions`. It imports nothing but types, because the typesafe-i18n generator
// transpiles it along with the locale. Each object satisfies its own slice of the generated types,
// so a key missing, left over or without its placeholder fails here.

import type { Translation } from '../../i18n/i18n-types';

export const tenants = {
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
} satisfies Translation['tenants'];

export const refusals = {
	tenant: {
		gone: 'لم يعد هذا المستأجر موجوداً في مساحة العمل. أعد التحميل لترى ما تغيّر.',
		holdsContracts: 'هناك عقود تذكر هذا المستأجر، فلا يمكن حذفه.',
		nationalIdTaken: 'الهوية الوطنية مرتبطة بمستأجر مسجل.',
		nationalIdTakenNamed: 'الهوية الوطنية {named} مرتبطة بمستأجر مسجل.',
		phoneTaken: 'رقم الهاتف مرتبط بمستأجر مسجل.',
		phoneTakenNamed: 'رقم الهاتف {named} مرتبط بمستأجر مسجل.',
		repeatedInSet: 'مستأجران في هذه المجموعة يطالبان بـ {value}.'
	}
} satisfies Pick<Translation['common']['refusals'], 'tenant'>;

// the create control's label on this feature's list, composed back at `common.actions`.
export const common = {
	actions: {
		newTenant: 'مستأجر جديد'
	}
} satisfies { actions: Pick<Translation['common']['actions'], 'newTenant'> };
