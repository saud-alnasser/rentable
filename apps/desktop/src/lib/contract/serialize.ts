import { getContractRank, type ContractRank } from '$lib/contract/rank/rank';
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
	/**
	 * the attention rank the contract is filed under today, where the read ranked it: a contract's
	 * acts gate on it (the reminder is offered only on the ranks that owe or fall due), so a read
	 * that hands a contract to its acts carries it. Absent on a contract in no rank.
	 */
	rank?: ContractRank;
	/**
	 * whether a successor that still stands renews it (effort 861, requirement 7), read through
	 * `renewedColumn` in `contract/row.ts` and never stored, so `ContractSchema` does not hold it and
	 * a restore cannot write it. The rank reads it, and the renew act gates on it, so every read that
	 * hands a contract to its acts carries it (`ContractActRecord`). A write's answer leaves it off,
	 * as it leaves off the rank: the write did not read it.
	 */
	renewed?: boolean;
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
		tenantId: record.tenantId,
		// carried so undoing a deletion puts the link back with the row (`contract.restoreMany`).
		renewsContractId: record.renewsContractId
	};

	if (tenantName !== undefined) {
		serializedContract.tenantName = tenantName;
	}

	if (tenantPhone !== undefined) {
		serializedContract.tenantPhone = tenantPhone;
	}

	return serializedContract;
}

/**
 * A serialized contract with the rank it is filed under today, where it has one: what its acts
 * gate on, so a read that hands a contract to its acts carries it. Left off rather than written as
 * `undefined` on a contract in no rank, as the serialized shape leaves off what it does not know.
 */
export function withRank<T extends SerializedContract>(
	contract: T,
	now: number,
	endingSoonNoticeDays: number
): T {
	const rank = getContractRank(contract, contract.paidAmount, now, endingSoonNoticeDays);

	return rank ? { ...contract, rank } : contract;
}
