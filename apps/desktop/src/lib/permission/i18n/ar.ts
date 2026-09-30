// The permission capability's strings in arabic, composed back into `i18n/ar/index.ts` at
// `common.permission`. It imports nothing but types, because the typesafe-i18n generator transpiles
// it along with the locale. Each object satisfies its own slice of the generated types, so a key
// missing, left over or without its placeholder fails here.

import type { Translation } from '../../i18n/i18n-types';

export const common = {
	permission: {
		missing: {
			viewComplex: 'ليست لديك صلاحية عرض المجمعات.',
			createComplex: 'ليست لديك صلاحية إضافة المجمعات.',
			editComplex: 'ليست لديك صلاحية تعديل المجمعات.',
			deleteComplex: 'ليست لديك صلاحية حذف المجمعات.',
			viewUnit: 'ليست لديك صلاحية عرض الوحدات.',
			createUnit: 'ليست لديك صلاحية إضافة الوحدات.',
			editUnit: 'ليست لديك صلاحية تعديل الوحدات.',
			deleteUnit: 'ليست لديك صلاحية حذف الوحدات.',
			viewTenant: 'ليست لديك صلاحية عرض المستأجرين.',
			createTenant: 'ليست لديك صلاحية إضافة المستأجرين.',
			editTenant: 'ليست لديك صلاحية تعديل المستأجرين.',
			deleteTenant: 'ليست لديك صلاحية حذف المستأجرين.',
			viewContract: 'ليست لديك صلاحية عرض العقود.',
			createContract: 'ليست لديك صلاحية إضافة العقود.',
			editContract: 'ليست لديك صلاحية تعديل العقود.',
			deleteContract: 'ليست لديك صلاحية حذف العقود.',
			viewPayment: 'ليست لديك صلاحية عرض المدفوعات.',
			createPayment: 'ليست لديك صلاحية إضافة المدفوعات.',
			editPayment: 'ليست لديك صلاحية تعديل المدفوعات.',
			deletePayment: 'ليست لديك صلاحية حذف المدفوعات.'
		},
		readOnly: 'وصولك إلى مساحة العمل هذه للقراءة فقط، فلا يمكن تغيير شيء فيها.'
	}
} satisfies Pick<Translation['common'], 'permission'>;
