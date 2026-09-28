// The undo capability's strings in arabic, composed back into `i18n/ar/index.ts` at `common.undo`.
// It imports nothing but types, because the typesafe-i18n generator transpiles it along with the
// locale. Each object satisfies its own slice of the generated types, so a key missing, left over
// or without its placeholder fails here.

import type { Translation } from '../../i18n/i18n-types';

export const common = {
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
	}
} satisfies Pick<Translation['common'], 'undo'>;
