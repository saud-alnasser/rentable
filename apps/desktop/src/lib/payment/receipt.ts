import type { DateLike } from '$lib/api/date';
import { getContractTotalCost, type ContractLike } from '$lib/contract/contract';
import {
	compareByAllocationOrder,
	scheduleContract,
	type SchedulePaymentLike
} from '$lib/contract/schedule';

/**
 * RECEIPT
 *
 * What a payment's receipt states that is not already a field of the payment: the reference it is
 * known by, the cycles it covers, and what remains of the contract's total cost once it is taken.
 * Pure, so the router answers with it and the tests pin it without a database. The page that
 * draws it is `payment/component/receipt.svelte`.
 *
 * A receipt is produced from the payment as it stands and is never stored: printing again after
 * an edit gives the edited receipt.
 */

/** Crockford's base32: no I, L, O or U, so a reference read aloud or copied by hand survives. */
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * The reference a receipt carries, which identifies this payment and no other.
 *
 * Taken from the payment's UUIDv7 (`platform/database/identity.ts`): its 48-bit timestamp, its
 * 12-bit counter and the last 20 bits of the id, 80 bits written as sixteen Crockford base32
 * characters, `XXXX-XXXX-XXXX-XXXX`. Two payments minted here share one only by being made in the
 * same millisecond with the same counter on two machines and drawing the same last 20 bits.
 *
 * **The last bits, not the first after the variant**, because of the payments recorded before ids
 * were UUIDs: migration 0003 gave every one of them one timestamp, one counter and a zeroed tail,
 * and wrote the old row number into the last 48 bits. Those rows differ only there, so a reference
 * read from anywhere else gave all of them the same one.
 *
 * **It is not a sequence**, and says nothing about how many receipts came before it: a gap-free
 * sequence cannot be issued by several machines recording offline.
 */
export function toReceiptReference(id: string): string {
	const hex = id.replaceAll('-', '');
	const timestamp = BigInt(`0x${hex.slice(0, 12)}`);
	// the version nibble sits above the counter, so the counter is the three characters after it.
	const counter = BigInt(`0x${hex.slice(13, 16)}`);
	// the last five characters: random for an id minted here, the old row number for one migrated.
	const tail = BigInt(`0x${hex.slice(27)}`);

	let bits = (timestamp << 32n) | (counter << 20n) | tail;
	let encoded = '';

	for (let index = 0; index < 16; index += 1) {
		encoded = CROCKFORD[Number(bits & 31n)] + encoded;
		bits >>= 5n;
	}

	return encoded.match(/.{4}/g)!.join('-');
}

/** A cycle a payment covers, as a receipt names it: its place in the period and its due day. */
export type ReceiptCycle = { index: number; due: Date };

export type ReceiptAllocation = {
	/** the cycles this payment covers, in order, from the oldest-first allocation. */
	cycles: ReceiptCycle[];
	/**
	 * what remains of the contract's total cost after this payment: the total, less this payment
	 * and every payment the allocation takes before it, and never below nothing.
	 */
	remaining: number;
};

/**
 * Where one payment stands in its contract's allocation: the cycles it covers and what remains of
 * the total cost once it and every payment before it are taken.
 *
 * "Before" is the allocation's own order (`contract/schedule.ts`), by date and then by the order
 * the payments were recorded, so a receipt and the schedule never disagree about which cycles a
 * payment paid. A payment recorded later but dated earlier is counted before this one, as the
 * schedule counts it.
 */
export function allocateReceipt(
	contract: ContractLike,
	payments: SchedulePaymentLike[],
	paymentId: string,
	now: DateLike
): ReceiptAllocation {
	const { cycles, coverage } = scheduleContract(contract, payments, now);
	const ordered = [...payments].sort(compareByAllocationOrder);
	const position = ordered.findIndex((payment) => payment.id === paymentId);
	const taken = ordered
		.slice(0, position + 1)
		.reduce((total, payment) => total + payment.amount, 0);

	return {
		cycles: (coverage.get(paymentId) ?? []).map((index) => ({
			index,
			due: cycles[index].due
		})),
		remaining: Math.max(0, getContractTotalCost(contract) - taken)
	};
}
