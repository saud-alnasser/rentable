// The organization session's strings in arabic: the sign-in card and the account menu's sign-out,
// composed back into `i18n/ar/index.ts` at `layout.signIn` and `common.actions`. It imports nothing
// but types, because the typesafe-i18n generator transpiles it along with the locale. It satisfies
// its own slice of the generated types, so a key missing, left over or without its placeholder
// fails here.

import type { Translation } from '../../../i18n/i18n-types';

export const layout = {
	signIn: {
		// اسم المنتج نفسه، كما يُكتب، في الترحيب.
		noOrganizationTitle: 'rentable',
		noOrganizationSubtitle: 'تابع الإيجارات والإيصالات والتذكيرات.',
		subtitle: 'سجّل الدخول للمتابعة.',
		help: 'لا تستطيع تسجيل الدخول؟',
		helpAnswer: 'اطلب المساعدة من مدير أو من مالك مؤسستك.',
		username: 'اسم المستخدم',
		password: 'كلمة المرور',
		unlocking: 'يجري تسجيل دخولك. يستغرق هذا لحظة عن قصد.',
		roleOwner: 'مالك',
		roleManager: 'مدير',
		roleMember: 'عضو',
		setUp: 'ابدأ بحساب Turso',
		setUpDescription: 'لمالك المؤسسة.',
		connectByLink: 'انضم برابط',
		connectByLinkDescription: 'لمن وصله رابط.',
		signedOutElsewhere: 'سُجّل خروجك من هذا الجهاز من جهاز آخر. سجّل الدخول مجددًا للمتابعة.',
		useALink: 'افتح رابطًا لديك',
		disconnect: 'افصل هذا الجهاز',
		disconnectDescription:
			'يحذف هذا الجهاز نسخته من المؤسسة ومساحات عملها، وينسى حساب Turso. لا يتغير شيء على Turso. يعيد المالك الربط بحساب Turso الخاص به، ويحتاج غيره إلى رابط جديد.'
	}
} satisfies Pick<Translation['layout'], 'signIn'>;

// the account menu's sign-out, composed back at `common.actions`.
export const common = {
	actions: {
		signOut: 'تسجيل الخروج'
	}
} satisfies { actions: Pick<Translation['common']['actions'], 'signOut'> };
