// The transfer capability's strings in arabic, composed back into `i18n/ar/index.ts` at
// `common.import`. It imports nothing but types, because the typesafe-i18n generator transpiles it
// along with the locale. Each object satisfies its own slice of the generated types, so a key
// missing, left over or without its placeholder fails here.

import type { Translation } from '../../i18n/i18n-types';

export const common = {
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
	}
} satisfies Pick<Translation['common'], 'import'>;
