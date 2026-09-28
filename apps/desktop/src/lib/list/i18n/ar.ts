// The list capability's strings in arabic, composed back into `i18n/ar/index.ts` at
// `common.export`, `common.periods`, `common.selection` and `common.table`. It imports nothing but
// types, because the typesafe-i18n generator transpiles it along with the locale. Each object
// satisfies its own slice of the generated types, so a key missing, left over or without its
// placeholder fails here.

import type { Translation } from '../../i18n/i18n-types';

export const common = {
	export: {
		description: 'إلى أي ملف يتحول هذا؟',
		nothingToExport: 'لا شيء هنا للتصدير'
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
	}
} satisfies Pick<Translation['common'], 'export' | 'periods' | 'selection' | 'table'>;
