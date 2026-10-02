// The workspace feature's strings in arabic, composed back into `i18n/ar/index.ts` at `workspace`,
// `earlier`, `layout.workspaceMenu`, `layout.noWorkspace` and `common.refusals.workspace`. It
// imports nothing but types, because the typesafe-i18n generator transpiles it along with the
// locale. Each object satisfies its own slice of the generated types, so a key missing, left over
// or without its placeholder fails here.

import type { Translation } from '../../i18n/i18n-types';

export const workspace = {
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
		'يرفض Turso حساب المؤسسة. يستمر العمل هنا؛ أصلِح الأمر على app.turso.tech ليُرسَل.'
} satisfies Translation['workspace'];

// the records 0.12.0 and 0.13.0 left on this machine, offered on the way in and in the settings
// area's workspace group until they are brought in or put aside (effort 838, requirement 18).
export const earlier = {
	wayIn: 'سجلات الإصدار {version} موجودة على هذا الجهاز. انقلها من الإعدادات حين توجد مساحة عمل.',
	title: 'سجلات الإصدار {version}',
	description: 'ما زالت على هذا الجهاز. راجع ما ستضيفه، ثم انقلها إلى {workspace}.',
	openOne: 'ما زالت على هذا الجهاز. افتح مساحة عمل لتنقلها إليها.',
	kept: 'تُحفظ نسخة منها في مصنف:',
	bringIn: 'انقلها...',
	dismiss: 'إخفاء'
} satisfies Translation['earlier'];

export const layout = {
	workspaceMenu: {
		create: 'مساحة عمل جديدة',
		members: '{count|number} عضو',
		open: 'مفتوحة',
		manage: 'إدارة مساحات العمل…',
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
	}
} satisfies Pick<Translation['layout'], 'workspaceMenu' | 'noWorkspace'>;

export const refusals = {
	workspace: {
		nothingToImport: 'لا يوجد ما يمكن استيراده.',
		unknownComplex: 'يذكر الملف مجمعاً باسم {name}، ولا يوجد مجمع بهذا الاسم.',
		unknownContract: 'يذكر الملف عقداً باسم {name}، ولا يوجد عقد بهذا الاسم.',
		unknownTenant: 'يذكر الملف مستأجراً باسم {name}، ولا يوجد مستأجر بهذا الاسم.',
		unknownUnit: 'يذكر الملف وحدة باسم {name}، ولا توجد وحدة بهذا الاسم.'
	}
} satisfies Pick<Translation['common']['refusals'], 'workspace'>;
