// The payment feature's strings in english, composed back into `i18n/en/index.ts` at
// `contracts.payments`, `common.refusals.payment` and `common.actions`. It imports nothing but types, because the
// typesafe-i18n generator transpiles it along with the locale.

import type { BaseTranslation } from '../../i18n/i18n-types';

export const payments = {
	emptyTitle: 'no payments yet',
	fullyPaidNotice: 'this contract is paid in full',
	fullyPaidSummary:
		'this contract has been fully paid. you can edit or delete payments, but you cannot add more.',
	method: 'payment method',
	methodNotRecorded: 'not recorded',
	methodOptional: 'payment method (optional)',
	methods: {
		bankTransfer: 'bank transfer',
		cash: 'cash',
		cheque: 'cheque',
		ejar: 'Ejar'
	},
	monthTotal: 'total shown for {month}',
	note: 'note',
	noteOptional: 'note (optional)',
	percentFulfilled: '{percent}% fulfilled',
	// a payment's receipt, printed in the language chosen. It says it was received and what
	// for; it is not a tax invoice and says nothing that reads as one.
	receipt: {
		amount: 'amount received',
		covers: 'covers',
		cycle: 'cycle {index:string}, due {date:string}',
		print: 'print receipt',
		receivedFrom: 'received from',
		receivedOn: 'date received',
		reference: 'receipt number',
		remaining: 'remaining of the contract total',
		title: 'receipt'
	},
	reference: 'reference',
	referenceOptional: 'reference (optional)',
	referencePlaceholder: 'transfer, cheque or SADAD number',
	remaining: '{amount:string} remaining',
	remainingAfter: 'remaining after this payment',
	remainingBalance: 'remaining balance',
	terminatedNotice: 'this contract is terminated',
	terminatedSummary: 'this contract is terminated and locked. payment records are read-only.',
	title: 'payments',
	titleFor: 'payments for {govId}',
	trackSummary: 'track contract payments and add new payment records here.'
} satisfies BaseTranslation;

export const refusals = {
	payment: {
		amountNotPositive: 'payment amount must be greater than zero.',
		datedInFuture: 'a payment cannot be dated in the future.',
		missing: 'this payment is no longer in the workspace. reload to see what changed.',
		repeatedInSet: 'two payments in this set claim {value:string}.'
	}
} satisfies BaseTranslation;

// the create control's label on this feature's list, composed back at `common.actions`.
export const common = {
	actions: {
		newPayment: 'new payment'
	}
} satisfies BaseTranslation;
