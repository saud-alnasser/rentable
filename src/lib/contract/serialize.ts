import * as s from '$lib/platform/database/schema';
import { type Contract } from '$lib/platform/database/schema';
import { deriveContractStatus, getContractPaymentSummary } from '$lib/contract/contract';

/**
 * SERIALIZE
 *
 * a contract row as callers receive it: dates as timestamps, the derived status rather
 * than the stored one, and the two payment figures every screen shows beside it. It sits
 * apart from either router because both the contract procedures and the dashboard answer
 * with this shape, and a router that owned it would have to be imported by the other.
 */

type DbContract = typeof s.contract.$inferSelect;
type DbPayment = typeof s.payment.$inferSelect;

export type SerializedContract = Omit<Contract, 'govId'> & {
	govId: string;
	tenantName?: string;
	tenantPhone?: string;
	paidAmount: number;
	expectedAmount: number;
};

export function serializeContract(
	record: DbContract,
	now: number,
	paymentsByContractId: Map<number, DbPayment[]> = new Map(),
	tenantName?: string,
	tenantPhone?: string
): SerializedContract {
	const payments = paymentsByContractId.get(record.id) ?? [];
	const { paidAmount, expectedAmount } = getContractPaymentSummary(record, payments);

	const serializedContract: SerializedContract = {
		id: record.id,
		govId: record.govId ?? '',
		status: deriveContractStatus(record, payments, now),
		start: record.start.getTime(),
		end: record.end.getTime(),
		interval: record.interval,
		cost: record.cost,
		tenantId: record.tenantId,
		paidAmount,
		expectedAmount
	};

	if (tenantName !== undefined) {
		serializedContract.tenantName = tenantName;
	}

	if (tenantPhone !== undefined) {
		serializedContract.tenantPhone = tenantPhone;
	}

	return serializedContract;
}
