// The unit's strings in arabic, composed back into `i18n/ar/index.ts` at `common.actions`,
// `common.labels` and `common.refusals.unit`. It imports nothing but types, because the
// typesafe-i18n generator transpiles it along with the locale. The object satisfies its own slice
// of the generated types, so a key missing, left over or without its placeholder fails here.

import type { Translation } from '../../../i18n/i18n-types';

// the create control's label on the unit's list, composed back at `common.actions`, and the unit's
// name for one of itself, at `common.labels`.
export const common = {
	actions: {
		newUnit: 'وحدة جديدة'
	},
	labels: {
		unit: 'وحدة'
	}
} satisfies {
	actions: Pick<Translation['common']['actions'], 'newUnit'>;
	labels: Pick<Translation['common']['labels'], 'unit'>;
};

// what a unit's refusal says, by the code it was raised with, composed back at
// `common.refusals.unit`.
export const refusals = {
	unit: {
		gone: 'لم تعد هذه الوحدة موجودة في مساحة العمل. أعد التحميل لترى ما تغيّر.',
		holdsContracts: 'هناك عقد يذكر هذه الوحدة، فلا يمكن حذفها.',
		nameRepeated: 'الاسم {name} مكرر؛ لكل وحدة اسمها الخاص.',
		nameTaken: 'الاسم مرتبط بوحدة في نفس المجمع.',
		nameTakenNamed: 'الاسم {named} مرتبط بوحدة في نفس المجمع.',
		repeatedInSet: 'وحدتان في هذه المجموعة تطالبان بـ {value}.'
	}
} satisfies Pick<Translation['common']['refusals'], 'unit'>;
