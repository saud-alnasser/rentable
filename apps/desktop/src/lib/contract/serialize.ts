import * as s from '$lib/platform/database/schema';
import { type Contract } from '$lib/platform/database/schema';

/**
 * SERIALIZE
 *
 * a contract row as callers receive it: dates as timestamps, and the status and payment
 * aggregates read from their stored columns — reconcile keeps them true, so nothing is
 * recomputed here. It sits apart from either router because both the contract
 * procedures and the dashboard answer with this shape, and a router that owned it would
 * have to be imported by the other.
 */

type DbContract = typeof s.contract.$inferSelect;

export type SerializedContract = Omit<Contract, 'govId'> & {
	govId: string;
	tenantName?: string;
	tenantPhone?: string;
};

export function serializeContract(
	record: DbContract,
	tenantName?: string,
	tenantPhone?: string
): SerializedContract {
	const serializedContract: SerializedContract = {
		id: record.id,
		govId: record.govId ?? '',
		status: record.status,
		start: record.start.getTime(),
		end: record.end.getTime(),
		interval: record.interval,
		cost: record.cost,
		paidAmount: record.paidAmount,
		expectedAmount: record.expectedAmount,
		tenantId: record.tenantId
	};

	if (tenantName !== undefined) {
		serializedContract.tenantName = tenantName;
	}

	if (tenantPhone !== undefined) {
		serializedContract.tenantPhone = tenantPhone;
	}

	return serializedContract;
}
