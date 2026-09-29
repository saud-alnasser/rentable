import type { RefusalField } from '$lib/error/refusal';

/**
 * Every refusal a payment rule or procedure raises, by code. The sentences are the interface's,
 * under `common.refusals.payment`; see `$lib/api/refusal`. A payment against a contract that is
 * not there is refused as `contract.missing`, since it is the contract that is missing.
 */
export type PaymentRefusalCode =
	| 'payment.amountNotPositive'
	| 'payment.datedInFuture'
	| 'payment.missing'
	| 'payment.repeatedInSet';

/** the field of the payment's form each of its refusals belongs under, where one does. */
export const PAYMENT_REFUSAL_FIELDS = {
	'payment.amountNotPositive': 'amount'
} satisfies Partial<Record<PaymentRefusalCode, RefusalField>>;
