// The organization feature's strings in arabic, composed back into `i18n/ar/index.ts` at
// `organization`, `common.refusals.host` and `common.actions`. It imports nothing but types,
// because the typesafe-i18n generator transpiles it along with the locale; the session's `layout`
// blocks are `session/i18n/ar.ts`. Each object satisfies its own slice of the generated types, so a
// key missing, left over or without its placeholder fails here.

import type { Translation } from '../../i18n/i18n-types';

export const organization = {
	mark: {
		alt: 'ختم المؤسسة',
		choose: 'اختيار صورة',
		description: 'يُطبع أسفل كل سند قبض وجدول دفعات.',
		image: 'الصورة',
		none: 'لم يُضف بعد',
		readOnly: 'يستطيع تغييره من يُسمح له بتغيير ختم المؤسسة.',
		remove: 'إزالة',
		removeDescription: 'تُطبع السندات والجداول دونه على كل جهاز. لا يعيده إلا اختيار صورة من جديد.',
		removeTitle: 'إزالة ختم المؤسسة',
		removed: 'أُزيل ختم المؤسسة',
		replace: 'استبدال الصورة',
		saved: 'حُفظ ختم المؤسسة',
		title: 'ختم المؤسسة'
	},
	setup: {
		connectTitle: 'اربط Turso',
		connectDescription: 'تُحفظ مؤسستك في حساب Turso الخاص بك.',
		position: 'الخطوة {step|number} من {total|number}',
		openDashboard: 'افتح لوحة تحكم Turso',
		connect: 'اربط',
		connectHint: 'يفتح المتصفح لتسمح بالوصول.',
		connecting: 'أكمل الموافقة في نافذة المتصفح التي فُتحت للتو.',
		connected: 'تم ربط حساب Turso.',
		consentAbandoned: 'لم تُمنح الموافقة. لم يُنشأ شيء.',
		consentFailed: 'رفضت Turso الموافقة.',
		existingTitle: 'ادخل إلى مؤسستك',
		existingDescription:
			'حساب Turso هذا يحمل مؤسسة بالفعل. يدخل مالكها هنا فينضم هذا الجهاز إليها.',
		existingConnect: 'اربط هذا الجهاز',
		existingConnecting: 'يجري ربط هذا الجهاز...',
		nameTitle: 'سمِّ مؤسستك',
		nameDescription: 'ستسجّل الدخول باسم المستخدم وكلمة المرور هذين.',
		nameLabel: 'اسم المؤسسة',
		usernameLabel: 'اسم المستخدم',
		nameRequired: 'أعطِ المؤسسة اسماً.',
		nameTooLong: 'هذا الاسم طويل جداً.',
		passwordLabel: 'كلمة المرور',
		passwordFloor: '12 حرفاً على الأقل.',
		passwordTooShort: 'استخدم 12 حرفاً على الأقل.',
		groupNeeded: 'لم تعرف rentable من Turso أي مجموعة تقصد، فاكتب اسمها هنا مرة واحدة.',
		groupLabel: 'مجموعة Turso',
		groupDescription: 'الاسم كما يظهر في شاشة موافقة Turso. قاعدة بيانات المؤسسة تسكن فيها.',
		groupRequired: 'اكتب اسم المجموعة التي حدّدتها في شاشة موافقة Turso.',
		create: 'أنشئ المؤسسة',
		creating: 'يجري إنشاء المؤسسة على حساب Turso الخاص بك...',
		copyLink: 'انسخ الرابط',
		linkCopied: 'تم نسخ الرابط.',
		continue: 'متابعة',
		back: 'رجوع'
	},
	join: {
		title: 'انضم برابط',
		description: 'الصق الرابط وأدخل الرمز الذي وصلك.',
		linkLabel: 'الرابط',
		reading: 'تجري قراءة الرابط...',
		unreadable: 'هذا ليس رابطًا من rentable. الصق الرابط كاملاً كما سُلّم إليك تمامًا.',
		unreachable: 'تعذّر الوصول إلى المؤسسة. تحقّق من الاتصال وحاول مجددًا.',
		lapsed: 'انتهت صلاحية هذا الرابط. اطلب رابطًا جديدًا ممن أرسله إليك.',
		consumed: 'سبق استخدام هذا الرابط هنا. سجّل الدخول بكلمة المرور التي اخترتها.',
		consumedElsewhere: 'سبق استخدام هذا الرابط. اطلب رابطًا جديدًا ممن أرسله إليك.',
		revoked: 'سُحب هذا الرابط. اطلب رابطًا جديدًا ممن أرسله إليك.',
		replaced: 'حلّ رابط أحدث محل هذا الرابط. اطلب الرابط الجديد ممن أرسله إليك.',
		anotherOrganization: 'هذا الجهاز مرتبط بمؤسسة أخرى. افصله عنها من شاشة تسجيل الدخول أولًا.',
		toSignIn: 'انتقل إلى تسجيل الدخول',
		passwordTitle: 'اختر كلمة مرور',
		passwordDescription: 'ستسجّل الدخول بها، ولا يمكن استعادتها.',
		organizationLabel: 'المؤسسة',
		codeLabel: 'الرمز',
		codeDescription: '6 أحرف.',
		codeWrong: 'الرمز خاطئ. اطلب ممن أرسل إليك الرابط أن يمليه عليك مجددًا.',
		codeMissing: 'اكتب الأحرف الستة التي رافقت الرابط.',
		confirmLabel: 'أكّد كلمة المرور',
		mismatch: 'الكلمتان غير متطابقتين.',
		continue: 'متابعة',
		tryAgain: 'حاول مجددًا',
		back: 'رجوع'
	},
	standing: {
		title: 'هذا الجهاز وTurso',
		purpose:
			'المؤسسة محفوظة على Turso وتصل إلى هذا الجهاز تلقائيًا. ما تكتبه يُرسل حين يمكن الوصول إلى Turso.',
		state: {
			upToDate: 'محدّث',
			syncing: 'جارية المزامنة',
			notYetReached: 'لم يصل بعد',
			needsAttention: 'يحتاج إلى عناية',
			needsReconnecting: 'يحتاج إلى إعادة ربط'
		},
		lastReachedRecently: 'آخر وصول إلى Turso {moment}',
		lastReached: 'آخر وصول إلى Turso في {moment}',
		reconnectOnAccount: 'أعد ربط حساب Turso من المغادرة.',
		detail: {
			label: 'ما يحفظه هذا الجهاز',
			workspace: 'مساحة العمل',
			copy: 'النسخة على هذا الجهاز'
		},
		checkNow: 'زامن'
	},
	dashboard: {
		membersTitle: 'الأعضاء',
		membersDescription: 'كل من في المؤسسة. الأعضاء يُنشأون ويُغيّرون من هنا.',
		workspacesDescription: 'كل مساحات عمل المؤسسة. مساحات العمل تُنشأ وتُغيّر من هنا.',
		workspaceOpenHere: 'مفتوحة على هذا الجهاز',
		workspaceYouOwn: 'المالك',
		workspaceYouEdit: 'يمكنك التعديل',
		workspaceYouRead: 'يمكنك القراءة',
		workspaceSetForYou: 'مخصّصة لك',
		workspaceCard: {
			memberCount: '{count|number}',
			noMembers: 'لا أحد',
			access: 'صلاحيتك',
			created: 'تاريخ الإنشاء'
		},
		memberCard: {
			password: 'كلمة المرور',
			passwordSet: 'معيّنة',
			noPassword: 'ليست بعد',
			machine: 'الجهاز',
			signedIn: 'مسجّل الدخول',
			noMachine: 'لا يوجد',
			workspaceCount: '{count|number}',
			noWorkspaces: 'لا توجد',
			joined: 'انضم',
			ownPermissions: 'صلاحيات خاصة به',
			offered: 'عُرضت عليه المؤسسة'
		},

		memberTitle: 'عضو جديد',
		memberDescription:
			'اسم المستخدم والدور ومساحات العمل التي يحملها. لا كلمة مرور له حتى يفتح رابطًا تصنعه له.',
		role: 'الدور',
		noWorkspaceToGrant: 'لا مساحة عمل لمنحها بعد. يمكن منحهم واحدة لاحقًا.',
		noMemberToGrant: 'لا عضو لإضافته إلى مساحة العمل هذه بعد.',
		addMember: 'أضف عضوًا',
		cannotSend:
			'rentable لا يرسل شيئًا: انسخ الرابط أدناه وسلّمه، وأعطِ الرمز على حدة. يعمل مرة واحدة.',
		linkTitle: 'الرابط والرمز',
		codeTitle: 'رمز التأكيد',
		codeDescription:
			'أملِ هذا الرمز في مكالمة أو وجهًا لوجه. إنه النصف الآخر مما يحتاجه الرابط، فلا يُرسل أبدًا معه.',
		done: 'تم',
		invitationExpires: 'تنتهي صلاحية الرابط في {date}',
		makeLink: 'اصنع رابطًا',
		transferOwnership: 'انقل الملكية',
		transferOwnershipGoes: 'يُعرض عليه أخذ المؤسسة. فإذا قبل، صار هو المالك وصرت أنت مديرًا.',
		transferOwnershipMember: 'من يُعرض عليه',
		transferOwnershipAuthority:
			'يبقى حساب Turso وقواعد بياناته معك. ويصل المالك الجديد حسابه قبل أن ينشئ مساحات عمل.',
		transferOwnershipConfirm: 'اعرضها',
		ownershipOffered: 'عُرضت المؤسسة. يقبلها من جهاز له هو.',
		withdrawOffer: 'اسحب العرض',
		withdrawOfferAsks: 'ينتهي العرض ولا تنتقل الملكية. يمكنك عرض المؤسسة من جديد.',
		ownershipOfferWithdrawn: 'سُحب العرض. لم تنتقل الملكية.',
		acceptOwnership: 'اقبل الملكية',
		acceptOwnershipGoes:
			'تصير مالك {organization} ويصير {owner} مديرًا، وتُوقَّع المؤسسة بكلمة مرورك من الآن.',
		acceptOwnershipAuthority:
			'يبقى حساب Turso مع من وصله. صِل حسابك من قسم المؤسسة لتنشئ مساحات العمل.',
		acceptOwnershipConfirm: 'اقبلها',
		ownershipAccepted: 'صارت المؤسسة لك. أنت المالك الآن.',
		lockOut: 'احظر',
		unsetPassword: 'أعد تعيين كلمة المرور',
		unsetPasswordAsks:
			'تتوقف كلمة مروره عن العمل على كل جهاز. الرابط الذي تصنعه له يتيح له اختيار كلمة جديدة.',
		passwordUnset: 'أُلغيت كلمة مروره. اصنع له رابطًا ليختار كلمة مرور جديدة.',
		endSessions: 'سجّل خروجه من كل جهاز',
		endSessionsAsks: 'يُسجَّل خروجه من كل جهاز. يعود بتسجيل الدخول من جديد.',
		sessionsEnded: 'سُجّل خروجه من كل جهاز.',
		sessionsEndedPending: 'هذا الجهاز غير متصل؛ سيصل تسجيل الخروج إلى أجهزته عند عودة الاتصال.',
		rename: 'غيّر الاسم',
		renameDescription:
			'اسم المستخدم الذي يسجل به الدخول على كل جهاز. لا شيء يخبره بأنه تغيّر؛ أخبره بنفسك.',
		username: 'اسم المستخدم',
		usernameDescription: 'اسم المستخدم الذي يسجل به الدخول على كل جهاز.',
		usernameRules:
			'اسم المستخدم من ثلاثة إلى اثنين وثلاثين حرفًا من الحروف والأرقام والنقاط والشرطات السفلية والشرطات',
		renamed: 'غُيّر اسم العضو.',
		authorityTitle: 'حساب Turso',
		authorityConnected: 'متصل على هذا الجهاز',
		authorityNotHeld: 'لا يحمله هذا الجهاز',
		authorityDetail: {
			label: 'ما يحمله حساب Turso',
			database: 'قاعدة بيانات المؤسسة',
			organization: 'المؤسسة'
		},
		reconnect: 'أعد الربط',
		authorityDescription:
			'لا يحمل هذا الجهاز صلاحية على حساب Turso، ولا يمكن استعادتها. امنح الموافقة مجددًا.',
		authorityFollowsTheAccount: 'الصلاحية تتبع حساب Turso الذي منحها، لا من يملك المؤسسة.',
		authorityReconnected: 'حساب Turso متصل على هذا الجهاز.',
		remove: 'أزل',
		removeDescription:
			'ينتهي وصوله حين تنتهي صلاحية اعتماده، خلال أربعة أسابيع. لا يتأثر أحد غيره.',
		removeAndLockOut: 'أزل واحظر',
		lockOutReading: 'تجري قراءة مساحات العمل التي يمسّها هذا...',
		lockOutDescription:
			'ينتهي وصوله إلى {workspaces} الآن، ويتوقف {count|number} من الأعضاء الآخرين فيها عن المزامنة حتى يعيد تطبيقهم الاتصال.',
		removed: 'أُزيل العضو. ينتهي وصوله حين تنتهي صلاحية اعتماده.',
		lockedOut: 'حُظر العضو. يعيد {count|number} من الأعضاء الآخرين الاتصال من تلقاء أنفسهم.',
		unreachableWorkspaces:
			'أنت لا تملك {workspaces}، لذا لم تستطع إعادة التعيين استعادتها. يمكن لمدير يملكها منحها مجددًا.',
		linkUnreachableWorkspaces:
			'أنت لا تملك {workspaces}، لذا لم يستطع الرابط نقلها. يمكن لمدير يملكها منحها مجددًا.',
		noWorkspaces: 'لا مساحة عمل بعد.',
		accessFull: 'وصول كامل',
		memberWorkspacesDescription: 'مساحات العمل التي يستطيع فتحها. شغّل مفتاح أي منها ليدخلها.',
		accessSaved: 'حُفظت مساحات العمل.',
		workspaceAccessTitle: 'الأعضاء والوصول',
		workspaceAccessDescription:
			'من يستطيع فتح {workspace}. شغّل مفتاح أي منهم ليدخلها. الوصول المسحوب يبقى حتى تنتهي صلاحيته.',
		deleteWorkspace: 'احذف مساحة العمل',
		deleteWorkspaceDescription:
			'تُحذف مساحة العمل وكل سجل فيها من Turso ومن كل جهاز يزامنها. لا شيء يعيدها.',
		workspaceDeleted: 'حُذفت مساحة العمل.',
		forgetAccount: 'انسَ حساب Turso',
		forget: 'انسَ',
		memberSheetDescription: 'ما يستطيع {username} فعله في هذه المؤسسة.',
		roleChanged: 'حُفظ الدور.',
		overrideSaved: 'حُفظ ما يستطيع فعله.',
		notBelowYou: 'ليس أدنى منك رتبة، فيفعل هذا من هو أعلى منه.',
		yourOwn: 'هذا أنت: يغيّر دورك وصلاحياتك من هو أعلى منك رتبة.',
		lacksFlag: 'لا يحق لك {flag}.',
		roleOutOfReach: 'الدور الذي في رتبتك أو فوقها يمنحه من هو أعلى منه.',
		leavingTitle: 'المغادرة',
		leavingDescription: 'كيف تبتعد عن المؤسسة.',
		disconnectForgets: 'يسجّل خروجك ويحذف نسخة المؤسسة من هذا الجهاز. لا يتغير شيء على Turso.',
		disconnectThisMachine: 'افصل هذا الجهاز',
		disconnectComesBack:
			'يسجّل خروجك ويحذف نسخة المؤسسة من هذا الجهاز. تبقى على Turso، ورابط جديد يعيدك إليها.',
		transfer: 'انقل',
		transferGoes: 'يصبح العضو الذي تختاره المالك حين يقبل، وتبقى أنت مديرًا.',
		withdraw: 'اسحب',
		offerStandsGoes: 'هناك عرض قائم. لا ينتقل شيء حتى يُقبل.',
		nobodyOfferable: 'لم يعيّن أحد كلمة مرور بعد، فلا أحد يستطيع تسلّمها.',
		disconnect: 'افصل',
		disconnected: 'لم يعد هذا الجهاز يحتفظ بالمؤسسة.',
		forgetAccountDescription:
			'يحتفظ هذا الجهاز برمز لحساب Turso الخاص بالمؤسسة. إن نسيته، فلن يصل شيء من هنا إلى ذلك الحساب.',
		forgetAccountRevokes:
			'النسيان لا يلغي الرمز. أنهِه من app.turso.tech. ربط حساب Turso من جديد يعيده.',
		forgetAccountRevokesAt: 'app.turso.tech',
		accountForgotten: 'لم يعد هذا الجهاز يحتفظ برمز وصول إلى حساب Turso.',
		deleteOrganization: 'احذف المؤسسة',
		deleteOrganizationDescription: 'تُحذف المؤسسة وكل مساحة عمل فيها من حساب Turso. لا شيء يعيدها.',
		deleteOrganizationGoes:
			'تُحذف كل مساحة عمل وكل سجل فيها، ويفقد كل عضو سبيل دخوله. لا شيء يعيد هذا.',
		organizationDeleted: 'حُذفت المؤسسة.'
	},

	roles: {
		owner: {
			who: 'يملك حساب Turso ويستطيع فعل أي شيء. المالك واحد، ولا يسلّم الملكية غيره.'
		},
		manager: {
			who: 'يضيف الأعضاء ويصنع الروابط ويمنح مساحات العمل. أما حساب Turso فيبقى للمالك.'
		},
		member: {
			who: 'يعمل في مساحات العمل التي يحملها، ولا يغيّر شيئًا عن أحد غيره إلا أن تأذن له.'
		}
	},

	families: {
		administration: 'المؤسسة',
		owner: 'للمالك وحده',
		complex: 'المجمعات',
		unit: 'الوحدات',
		tenant: 'المستأجرون',
		contract: 'العقود',
		payment: 'المدفوعات'
	},
	flagVerbs: {
		view: 'عرض',
		create: 'إضافة',
		edit: 'تعديل',
		delete: 'حذف'
	},
	flags: {
		inviteMember: 'دعوة الأعضاء',
		removeMember: 'إزالة الأعضاء',
		assignRole: 'منح الأعضاء أدوارهم',
		renameWorkspace: 'تغيير أسماء مساحات العمل',
		resetPassword: 'إعادة تعيين كلمات المرور',
		renameMember: 'تغيير أسماء الأعضاء',
		grantWorkspace: 'منح مساحات العمل',
		manageRoles: 'إدارة الأدوار',
		overrideMember: 'تغيير صلاحيات عضو بعينه',
		manageMark: 'تغيير ختم المؤسسة',
		createWorkspace: 'إنشاء مساحات العمل',
		deleteWorkspace: 'حذف مساحات العمل',
		mintReadOnly: 'منح وصول القراءة فقط',
		lockOut: 'حظر الأعضاء',
		renewCredentials: 'تجديد الاعتمادات',
		tursoAccount: 'وصل حساب Turso',
		transferOwnership: 'نقل المؤسسة',
		deleteOrganization: 'حذف المؤسسة'
	},

	roleList: {
		title: 'الأدوار',
		description: 'ما يستطيع كل صنف من الناس فعله، من الأعلى رتبة. وبطاقة العضو تغيّره له وحده.',
		add: 'أضف دورًا',
		rank: 'الرتبة',
		heldBy: 'يحمله {count|number} {{عضو|أعضاء}}',
		heldByNobody: 'لا يحمله أحد بعد',
		carriesNothing: 'لا شيء بعد',
		moveUp: 'انقله أعلى',
		moveDown: 'انقله أدنى',
		highest: 'هو أصلًا أدنى من المدير مباشرة.',
		lowest: 'هو أصلًا أعلى من العضو مباشرة.',
		notBelowYou: 'هذا الدور ليس أدنى من دورك.',
		newTitle: 'دور جديد',
		newDescription:
			'اسم، وما يستطيع كل من يُمنحه فعله. يبدأ أعلى من العضو مباشرة، ويُنقل من بطاقته.',
		editDescription: 'ما يستطيع كل من يحمل دور {role} فعله.',
		name: 'الاسم',
		nameDescription: 'ما يُسمّى به الدور على كل بطاقة.',
		builtInName: 'لكل مؤسسة هذا الدور، فيبقى اسمه كما هو.',
		flagsTitle: 'ما يستطيع فعله',
		create: 'أضف الدور',
		deleteTitle: 'احذف الدور',
		deleteDescription: 'يصبح كل من كان يحمله عضوًا، له ما يمنحه دور العضو بالضبط.',
		created: 'أُضيف الدور.',
		saved: 'حُفظ الدور.',
		moved: 'نُقل الدور.',
		deleted: 'حُذف الدور.'
	},

	override: {
		legend: 'تجاوز على مستوى المؤسسة',
		says: 'يتجاوز دوره في المؤسسة كلها.',
		workspaces: 'تجاوزات مساحات العمل',
		workspacesSays: 'مساحات العمل التي يستطيع فتحها، وفي كل واحدة تجاوزات لصلاحياته في المؤسسة.'
	},

	switches: {
		verbSays: {
			view: 'رؤيتها في القوائم وفي صفحاتها.',
			create: 'إضافة جديد منها.',
			edit: 'تغيير ما فيها.',
			delete: 'إزالتها.'
		},
		flagSays: {
			editContract: 'تغييرها، بما في ذلك الإنهاء والتجديد والاستعادة.',
			inviteMember: 'إدخال أشخاص جدد إلى المؤسسة.',
			removeMember: 'إخراج أشخاص من المؤسسة.',
			assignRole: 'اختيار الدور الذي يحمله كل عضو.',
			renameWorkspace: 'تغيير اسم مساحة العمل.',
			resetPassword: 'تمكين عضو فقد كلمة مروره من تعيين كلمة جديدة.',
			renameMember: 'تغيير اسم المستخدم لعضو.',
			grantWorkspace: 'إدخال الأعضاء إلى مساحات العمل أو إخراجهم منها.',
			manageRoles: 'إضافة الأدوار وتعديلها وترتيبها وحذفها.',
			overrideMember: 'منح عضو بعينه أكثر أو أقل مما يمنحه دوره.',
			manageMark: 'ضبط ختم المؤسسة المطبوع على صفحاتها.'
		},
		viewFirst: 'شغّل العرض أولًا، فإضافة السجل أو تعديله أو حذفه تحتاج إلى رؤيته.',
		groupRefused: 'بعضها ليس لك أن تغيّره',
		folded: '{count|number} من {total|number}',
		owner: 'إنشاء مساحات العمل وحذفها وحساب Turso وتسليم المؤسسة تبقى للمالك.',
		notHeld: 'المفتاح الباهت صلاحية لا تحملها أنت، فليس لك أن تغيّرها.',
		writesNotHeld: 'إيقافه يوقف صلاحية تحته لا تحملها أنت.',
		differs: 'يختلف عن {role}',
		custom: 'مخصّص',
		reset: 'أعِده إلى {role}',
		resetNotHeld: 'الإعادة تغيّر صلاحية لا تحملها أنت.'
	},

	roleCard: {
		everything: 'وصول كامل إلى كل شيء',
		full: 'وصول كامل إلى {kinds}',
		does: '{verbs} {kinds}',
		verbs: {
			view: 'يعرض',
			create: 'يضيف',
			edit: 'يعدّل',
			delete: 'يحذف'
		},
		kinds: {
			complex: 'المجمعات',
			unit: 'الوحدات',
			tenant: 'المستأجرين',
			contract: 'العقود',
			payment: 'المدفوعات'
		},
		everyRecord: 'كل السجلات',
		everyOtherRecord: 'بقية السجلات',
		organization: {
			all: 'يدير المؤسسة',
			some: 'يشارك في إدارة المؤسسة'
		},
		holders: '{count|number} {{عضو|عضو|عضوان|أعضاء|عضوًا|عضو}}',
		noHolders: 'لا أحد بعد',
		fields: {
			reads: 'يعرض',
			changes: 'يغيّر',
			people: 'الأشخاص',
			organization: 'المؤسسة'
		},
		kindsOf: '{held|number} من {total|number} أنواع',
		noKinds: 'لا شيء',
		everyAct: 'كل الصلاحيات',
		actsOf: '{held|number} من {total|number} صلاحيات',
		noActs: 'لا شيء'
	},

	foreseen: {
		roleMoves: 'هذا الدور يغيّر صلاحية {flag}، ولا يحق لك ذلك.',
		pinnedMoves: 'هذا الدور يلغي صلاحية {flag} المضبوطة له في مساحة عمل، ولا يحق لك ذلك.',
		deleteMoves: 'حذفه يغيّر صلاحية {username} في {flag}، ولا يحق لك ذلك.',
		holdersBlind:
			'{names}: إضافة سجلات أو تعديلها أو حذفها دون رؤيتها. أعِد كل واحد إلى هذا الدور من بطاقته أولًا.'
	},

	workspaceSwitches: {
		permissions: 'الصلاحيات',
		permissionsSays:
			'ما يستطيعه في مساحة العمل هذه وحدها. والنقطة تدل على ما يختلف عن بقية المؤسسة.',
		differs: 'يختلف عن بقية المؤسسة',
		customHere: 'مخصّص هنا',
		movesNotHeld: 'هذا يغيّر هنا صلاحية لا تحملها أنت.',
		notHeld: 'تحمل مساحة العمل هذه للقراءة فقط، فلا تستطيع منحها.'
	}
} satisfies Translation['organization'];

// what the shell says, by the reason a Rust refusal carries (`$lib/error/tauri`): every reason but
// a kind's refusal of a write without its view, which the index writes beside these.
export const refusals = {
	host: {
		lapsed: 'انتهت صلاحية هذا الرابط. اطلب رابطاً جديداً ممن أرسله إليك.',
		consumed: 'استُخدم هذا الرابط من قبل. اطلب رابطاً جديداً ممن أرسله إليك.',
		revoked: 'سُحب هذا الرابط. اطلب رابطاً جديداً ممن أرسله إليك.',
		replaced: 'حلّ محل هذا الرابط رابط أحدث. اطلب الرابط الجديد ممن أرسله إليك.',
		codeMissing: 'اكتب الرمز المكوّن من ستة أحرف الذي وصلك مع الرابط.',
		codeWrong: 'الرمز غير صحيح. اطلب ممن أرسل الرابط أن يقرأه عليك مرة أخرى.',
		linkUnreadable: 'هذا ليس رابط انضمام إلى rentable. انسخ الرابط كاملاً وحاول مرة أخرى.',
		linkNotAnInvitation:
			'هذا الرابط يربط جهازاً آخر ولا يحمل دعوة. سجّل الدخول باسم المستخدم وكلمة المرور بدلاً من ذلك.',
		linkNotForAMachine: 'هذا الرابط دعوة وليس رابطاً لجهاز آخر. افتحه حيث تُقبل الدعوات.',
		anotherOrganizationHeld: 'يحمل هذا الجهاز مؤسسة أخرى بالفعل. افصلها أولاً.',
		credentialsWrong: 'اسم المستخدم أو كلمة المرور غير صحيحة.',
		passwordTooShort: 'تحتاج كلمة المرور إلى 12 حرفاً على الأقل.',
		passwordChangeRequired: 'غيّر كلمة المرور قبل أي شيء آخر.',
		signedOut: 'لا أحد مسجّل الدخول على هذا الجهاز. سجّل الدخول وحاول مرة أخرى.',
		noOrganization: 'لا يحمل هذا الجهاز أي مؤسسة بعد.',
		noMemberYet: 'لم يسجّل أحد الدخول إلى المؤسسة على هذا الجهاز بعد. سجّل الدخول أولاً.',
		signInAgain: 'لم يعد حسابك على هذا الجهاز محدّثاً. سجّل الدخول مرة أخرى.',
		youWereRemoved: 'أُزلت من هذه المؤسسة.',
		sessionsEnded: 'أُنهيت جلساتك من جهاز آخر. سجّل الدخول مرة أخرى.',
		keyNotInForce: 'سُلّمت المؤسسة إلى مالك جديد، فلا يستطيع القيام بهذا سواه.',
		machineMissing: 'لم يعد ذلك الجهاز مسجل الدخول باسمك. أعد التحميل لترى ما تغيّر.',
		machineNotUpdated:
			'لم يشغّل ذلك الجهاز هذا الإصدار بعد، فلا يُسجَّل خروجه وحده. سجّل الخروج من كل الأجهزة الأخرى بدلًا من ذلك.',
		usernameInvalid:
			'يتكوّن اسم المستخدم من 3 إلى 32 من الحروف أو الأرقام أو النقاط أو الشرطات السفلية أو الشرطات، دون مسافات.',
		usernameTaken: 'اسم المستخدم هذا مأخوذ في هذه المؤسسة. اختر اسماً آخر.',
		roleUnknown: 'اختر دورًا من أدوار المؤسسة.',
		memberMissing: 'لم يعد هذا العضو في هذه المؤسسة. أعد التحميل لترى ما تغيّر.',
		markNotAnImage: 'اختر صورة بصيغة PNG أو JPEG أو WebP.',
		markTooLarge: 'حجم الصورة أكبر من 512 كيلوبايت. اختر صورة أصغر.',
		memberGone: 'لم يعد هذا الحساب في المؤسسة.',
		memberRemoved: 'أُزيل هذا العضو. أنشئ له حساباً من جديد إن كان سيعود.',
		notYourself: 'لا يمكنك القيام بهذا على حسابك أنت. يستطيع ذلك من هو أعلى منك رتبة.',
		ownerProtected: 'لا يُغيَّر حساب المالك بهذه الطريقة، فالمؤسسة ملكه.',
		ownerOnly: 'لا يقوم بهذا إلا المالك. اطلبه منه.',
		ownerMachineOnly: 'يحتاج هذا إلى حساب Turso المتصل بجهاز المالك. اطلبه من المالك.',
		roleLacksAct: 'لا يشمل دورك هذا الإجراء. اطلبه من أحد المديرين.',
		notAdministrator: 'لا يقوم بهذا إلا مدير.',
		rankNotAbove: 'هذا الدور ليس أدنى من دورك. اطلب ذلك ممن هو أعلى منه رتبة.',
		roleUnsettled:
			'غيّر سجلَّ هذا العضو من لا يحق له ذلك. يزيله من هو أعلى منه رتبة ثم ينشئ له حساباً من جديد.',
		roleBuiltIn:
			'هذا الدور موجود في كل مؤسسة، فلا يُعاد تسميته ولا يُنقل ولا يُحذف. ودور المالك يشمل كل شيء دائماً.',
		roleNameMissing: 'اكتب اسماً للدور.',
		roleNameTaken: 'هناك دور آخر بهذا الاسم. اختر اسماً مختلفاً.',
		roleOutOfPlace: 'يأتي الدور أدنى من المدير وأعلى من العضو.',
		noRankBelow: 'لم يبقَ مكان أدنى من دورك. اطلب ذلك ممن هو أعلى منك رتبة.',
		ownerRoleNotAssigned: 'لا ينتقل دور المالك إلا حين يسلّم المالك المؤسسة.',
		recordFlagsOnly: 'لا تغيّر مساحة العمل إلا ما يُفعل بسجلاتها. اضبط الباقي على مستوى المؤسسة.',
		alreadyOwner: 'أنت المالك بالفعل. اختر الحساب الذي ستنتقل إليه المؤسسة.',
		accountNotSetUp:
			'ليست لهذا الحساب كلمة مرور خاصة به بعد. بعد أن يفتح صاحبه رابطه ويختار واحدة، اعرض عليه المؤسسة مرة أخرى.',
		offerPending: 'المؤسسة معروضة على حساب بالفعل. اسحب ذلك العرض أولاً.',
		offerAccepted: 'قُبل العرض بالفعل وأصبحت المؤسسة ملكه الآن. لم يتغيّر شيء.',
		nothingOffered: 'لا يوجد عرض قائم لهذه المؤسسة.',
		offererGone: 'لم يعد الحساب الذي عرض عليك المؤسسة موجوداً فيها.',
		organizationNameMissing: 'تحتاج المؤسسة إلى اسم.',
		workspaceNameMissing: 'تحتاج مساحة العمل إلى اسم.',
		workspaceMissing: 'لم تعد مساحة العمل هذه في المؤسسة. أعد التحميل لترى ما تغيّر.',
		noWorkspaceOpen: 'لا توجد مساحة عمل مفتوحة على هذا الجهاز. افتح واحدة وحاول مرة أخرى.',
		noGrant: 'ليست لديك صلاحية على مساحة العمل هذه.',
		grantMissing: 'ليست لهذا العضو صلاحية على مساحة العمل هذه.',
		grantBeyondOwn: 'لا يمكنك مشاركة مساحة عمل إلا إذا كانت لديك صلاحية كاملة عليها.',
		noOrganizationCredential:
			'لا يملك هذا الجهاز صلاحية الوصول إلى سجلات المؤسسة. سجّل الدخول مرة أخرى وأعد المحاولة.',
		workspaceNewer: 'رقّى إصدار أحدث من rentable مساحة العمل هذه. حدّث rentable لتفتحها.',
		workspaceBehind:
			'تحتاج مساحة العمل هذه إلى ترقية، وصلاحية القراءة وحدها لا تكفي لذلك. اطلب من عضو بصلاحية كاملة أن يفتحها مرة واحدة.',
		workspaceNeedsOpening:
			'مساحة العمل هذه أقدم من هذا الإصدار من rentable. افتحها مرة واحدة على هذا الجهاز لتحديثها.',
		databaseRefused: 'رفضت قاعدة البيانات الطلب ولم يتغيّر شيء. حاول مرة أخرى لاحقاً.',
		organizationOlder:
			'أنشأ إصدار أقدم هذه المؤسسة، وهي تنتظر مالكها ليفتحها في هذا الإصدار فيرقّيها.',
		organizationUpgradeOffline:
			'ترقية هذه المؤسسة تحتاج إلى اتصال. اتصل بالإنترنت وسجّل الدخول مرة أخرى؛ لم يتغيّر شيء.',
		organizationChangesUnsendable:
			'يحمل هذا الجهاز تغييرات لم تُرسل ولا تقبلها المؤسسة بعد ترقيتها. افصله ثم اربطه مرة أخرى لتُحذف.',
		organizationCredentialLapsed:
			'انتهت صلاحية وصول هذا الجهاز إلى المؤسسة. اطلب من مؤسستك رابطاً جديداً لتربطه مرة أخرى.',
		organizationNewer: 'أنشأ إصدار أحدث من rentable هذه المؤسسة. حدّث rentable لتفتحها.',
		copyNotTaken:
			'تعذّر أخذ نسخة قبل الترقية، فلم يتغيّر شيء. تحقّق من الاتصال ومن مجلد النسخ الاحتياطية، ثم حاول مرة أخرى.',
		shapeNotAsBuilt:
			'فشلت الترقية في فحصها، فلم يتغيّر شيء. حدّث rentable وحاول مرة أخرى؛ ويبيّن سجل التشخيص السبب.',
		tursoNotConnected: 'هذا الجهاز غير متصل بحساب Turso. اربطه وحاول مرة أخرى.',
		consentNeededAgain: 'تحتاج Turso إلى منح الموافقة من جديد. اربط حساب Turso مرة أخرى.',
		consentGone: 'لم تعد هذه الموافقة قيد الانتظار. ابدأها من جديد.',
		groupMismatch: 'ليست هذه المجموعة التي مُنحت الموافقة عليها. تحقّق من الاسم وحاول مرة أخرى.',
		groupNeeded: 'تحتاج Turso إلى اسم المجموعة التي اخترتها. اكتبه أدناه.',
		groupHoldsOrganization: 'تحمل هذه المجموعة مؤسسة بالفعل. اختر مجموعة أخرى أو حساب Turso آخر.',
		groupEmpty: 'مُنحت الموافقة على مجموعة لا تحمل أي مؤسسة. امنحها على المجموعة التي تحمل مؤسستك.',
		nothingToConnectTo: 'لا يحمل حساب Turso هذا أي مؤسسة للاتصال بها. عد وأنشئ واحدة.',
		createRefused: 'لم تُنشئ Turso قاعدة بيانات المؤسسة.',
		tursoRefused: 'رفضت Turso الطلب. لن تفيد إعادة المحاولة.',
		tursoAccountRefused: 'رفضت Turso الطلب بسبب الحساب نفسه. راجع خطة الحساب في Turso.'
	}
} satisfies {
	host: Omit<Translation['common']['refusals']['host'], `${string}NeedsViewing`>;
};

// the setup walk's connect and join controls, composed back at `common.actions`.
export const common = {
	actions: {
		connect: 'ربط',
		join: 'انضمام'
	}
} satisfies { actions: Pick<Translation['common']['actions'], 'connect' | 'join'> };
