// The complex feature's strings in arabic, composed back into `i18n/ar/index.ts` at `complexes`,
// `common.refusals.complex`, `common.actions` and `common.labels`. It imports nothing but types,
// because the typesafe-i18n generator transpiles it along with the locale. Each object satisfies
// its own slice of the generated types, so a key missing, left over or without its placeholder
// fails here.

import type { Translation } from '../../i18n/i18n-types';

export const complexes = {
	deleteDialog: {
		blockedUnitsUnderContract: 'وحدة أو أكثر من وحداته مذكورة في عقد',
		unitsGoWithIt: 'ستُحذف معه وحداته الـ {count|number}.'
	},

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
		deleteSummaryWithUnits: 'سيتم حذف {count|number} مجمع ومعها {units|number} وحدة',
		deleteTitle: 'حذف المجمعات',
		refusedDeletesUnits: '{count|number} فيها وحدات لا يمكنك حذفها',
		refusedMissing: '{count|number} لم تعد موجودة في مساحة العمل',
		refusedUnitsUnderContract: '{count|number} فيها وحدات مذكورة في عقد',
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
} satisfies Translation['complexes'];

export const refusals = {
	complex: {
		gone: 'لم يعد هذا المجمع موجوداً في مساحة العمل. أعد التحميل لترى ما تغيّر.',
		nameTaken: 'الاسم مرتبط بمجمع مسجل مسبقاً.',
		nameTakenNamed: 'الاسم {named} مرتبط بمجمع مسجل مسبقاً.',
		repeatedInSet: 'مجمعان في هذه المجموعة يطالبان بـ {value}.',
		unitsUnderContract: 'وحدة أو أكثر من وحداته مذكورة في عقد، لذا لا يمكن حذف هذا المجمع.'
	}
} satisfies Pick<Translation['common']['refusals'], 'complex'>;

// the create control's label on this feature's list, composed back at `common.actions`, and the
// complex's column labels, at `common.labels`.
export const common = {
	actions: {
		newComplex: 'مجمع جديد'
	},
	labels: {
		location: 'الموقع',
		occupiedUnits: 'وحدات مشغولة',
		vacantUnits: 'وحدات شاغرة'
	}
} satisfies {
	actions: Pick<Translation['common']['actions'], 'newComplex'>;
	labels: Pick<Translation['common']['labels'], 'location' | 'occupiedUnits' | 'vacantUnits'>;
};
