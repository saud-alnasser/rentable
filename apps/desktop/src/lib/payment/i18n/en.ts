// The payment feature's strings in english, composed back into `i18n/en/index.ts` at
// `contracts.payments`, `common.refusals.payment`, `common.actions` and `common.labels`. It imports
// nothing but types, because the typesafe-i18n generator transpiles it along with the locale.

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
	// money returned to the tenant, recorded from the ledger as a payment going out (effort 854,
	// requirements 25 and 26). The month header states it apart from what was received, and a
	// received payment on a terminated contract says on its row why it is locked and what unlocks it.
	refund: {
		created: 'refund recorded successfully!',
		deleted: 'refund deleted successfully!',
		historyName: 'refund {amount:string}',
		kind: 'type',
		limitHint: 'most you can refund',
		locked: 'the contract is terminated. restore it to change this payment.',
		monthReceived: 'received',
		monthReturned: 'returned',
		monthReturnedTotal: 'returned in {month}',
		new: 'record refund',
		received: 'payment received',
		tag: 'refund',
		title: 'refund',
		unavailable: {
			nothingLeftToRefund: 'nothing this contract received is left to refund.',
			nothingToRefund:
				"nothing was paid beyond this contract's total. a payment recorded by mistake is deleted instead."
		},
		updated: 'refund updated successfully!'
	},
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

// the create control's label on this feature's list and the form's pending state, composed back at
// `common.actions`, and the payment's field and column labels, at `common.labels`.
export const common = {
	actions: {
		newPayment: 'new payment',
		creating: 'creating...'
	},
	labels: {
		amount: 'amount',
		contractStatus: 'contract status',
		payment: 'payment',
		paymentDate: 'payment date'
	}
} satisfies BaseTranslation;
