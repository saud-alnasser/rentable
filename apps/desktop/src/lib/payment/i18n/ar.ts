// The payment feature's strings in arabic, composed back into `i18n/ar/index.ts` at
// `contracts.payments` and `common.refusals.payment`. It imports nothing but types, because the
// typesafe-i18n generator transpiles it along with the locale. Each object satisfies its own slice
// of the generated types, so a key missing, left over or without its placeholder fails here.

import type { Translation } from '../../i18n/i18n-types';

export const payments = {
	emptyTitle: 'لا توجد دفعات بعد',
	fullyPaidNotice: 'هذا العقد مسدد بالكامل',
	fullyPaidSummary: 'تم سداد العقد بالكامل.',
	method: 'طريقة الدفع',
	methodNotRecorded: 'غير مسجلة',
	methodOptional: 'طريقة الدفع (اختياري)',
	methods: {
		bankTransfer: 'تحويل بنكي',
		cash: 'نقدًا',
		cheque: 'شيك',
		ejar: 'إيجار'
	},
	monthTotal: 'الإجمالي المعروض في {month}',
	note: 'ملاحظة',
	noteOptional: 'ملاحظة (اختياري)',
	percentFulfilled: '{percent}% مكتمل',
	receipt: {
		amount: 'المبلغ المستلم',
		covers: 'يغطي',
		cycle: 'الدورة {index}، تستحق في {date}',
		print: 'طباعة السند',
		receivedFrom: 'استلمنا من',
		receivedOn: 'تاريخ الاستلام',
		reference: 'رقم السند',
		remaining: 'المتبقي من إجمالي العقد',
		title: 'سند قبض'
	},
	reference: 'المرجع',
	referenceOptional: 'المرجع (اختياري)',
	referencePlaceholder: 'رقم التحويل أو الشيك أو سداد',
	remaining: 'متبقٍ {amount}',
	remainingAfter: 'المتبقي بعد هذه الدفعة',
	remainingBalance: 'الرصيد المتبقي',
	terminatedNotice: 'هذا العقد منتهي',
	terminatedSummary: 'العقد منتهي والمدفوعات للقراءة فقط.',
	title: 'المدفوعات',
	titleFor: 'مدفوعات {govId}',
	trackSummary: 'تتبع المدفوعات وإضافة دفعات جديدة.'
} satisfies Translation['contracts']['payments'];

export const refusals = {
	payment: {
		amountNotPositive: 'يجب أن يكون مبلغ الدفعة أكبر من صفر.',
		datedInFuture: 'لا يمكن أن يكون تاريخ الدفعة في المستقبل.',
		missing: 'لم تعد هذه الدفعة موجودة في مساحة العمل. أعد التحميل لترى ما تغيّر.',
		repeatedInSet: 'دفعتان في هذه المجموعة تطالبان بـ {value}.'
	}
} satisfies Pick<Translation['common']['refusals'], 'payment'>;
