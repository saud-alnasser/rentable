// The organization session's strings in arabic: the account menu at the foot of the rail and the
// sign-in card, composed back into `i18n/ar/index.ts` at `layout.accountMenu` and
// `layout.signIn`. It imports nothing but types, because the typesafe-i18n generator transpiles it
// along with the locale. It satisfies its own slice of the generated types, so a key missing, left
// over or without its placeholder fails here.

import type { Translation } from '../../../i18n/i18n-types';

export const layout = {
	accountMenu: {
		signedOutHint: 'غير مسجل الدخول',
		signedOutName: 'مستخدم'
	},

	signIn: {
		noOrganizationTitle: 'مرحبًا',
		noOrganizationSubtitle: 'لا مؤسسة على هذا الجهاز بعد.',
		subtitle: 'سجّل الدخول للمتابعة',
		help: 'تواجه صعوبة في تسجيل الدخول؟',
		username: 'اسم المستخدم',
		password: 'كلمة المرور',
		unlocking: 'يجري تسجيل دخولك. يستغرق هذا لحظة عن قصد.',
		roleOwner: 'مالك',
		roleManager: 'مدير',
		roleMember: 'عضو',
		setUp: 'استعمل حساب Turso الخاص بك',
		setUpDescription: 'أنت مالك المؤسسة.',
		connectByLink: 'استعمل رابطًا ورمزًا',
		connectByLinkDescription: 'سُلّم إليك رابط ورمز.',
		signedOutElsewhere: 'سُجّل خروجك من هذا الجهاز من جهاز آخر. سجّل الدخول مجددًا للمتابعة.',
		useALink: 'افتح رابطًا لديك',
		disconnect: 'افصل هذا الجهاز',
		disconnectDescription:
			'يحذف هذا الجهاز نسخته من المؤسسة ومساحات عملها، وينسى حساب Turso. لا يتغير شيء على Turso. يعيد المالك الربط بحساب Turso الخاص به، ويحتاج غيره إلى رابط جديد.'
	}
} satisfies Pick<Translation['layout'], 'accountMenu' | 'signIn'>;
