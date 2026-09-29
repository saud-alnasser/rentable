import * as s from '$lib/platform/database/schema';
import { type Payment } from '$lib/platform/database/schema';

/**
 * SERIALIZE
 *
 * a payment row as callers receive it, and a payment's text as it is stored. It sits apart from
 * the routers because the payment's own procedures and its selection's both answer with this
 * shape and store text this way.
 */

export function serializePayment(record: typeof s.payment.$inferSelect): Payment {
	return {
		id: record.id,
		date: record.date.getTime(),
		amount: record.amount,
		contractId: record.contractId,
		method: record.method,
		reference: record.reference,
		note: record.note
	};
}

/**
 * A reference or a note as it is stored: what the reader wrote, or nothing. A field left blank is
 * the same absence as one never filled, so neither is kept as an empty string a record would then
 * have to tell apart from a value. Absent from the call, it stays absent, so an edit that does not
 * name the field leaves it as it was.
 */
export function toStoredText(value: string | null | undefined): string | null | undefined {
	return value === undefined ? undefined : value?.trim() || null;
}
