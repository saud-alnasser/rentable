/**
 * THE PAYMENT'S ENTRY
 *
 * what another concept may import of the payment, which is only the refusals it raises and the fields
 * they belong under, for the composition root's union of them (`$lib/app/refusal`): it depends on the contract, and no concept
 * depends on it. What the contract reads of it, the payments that refuse a contract's deletion and
 * whether the reader may see them, it contributes in its `surface.ts`.
 */
export { PAYMENT_REFUSAL_FIELDS, type PaymentRefusalCode } from './refusal';
