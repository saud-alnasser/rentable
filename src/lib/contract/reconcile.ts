import type { Database } from '$lib/api/context';
import * as s from '$lib/platform/database/schema';
import {
	deriveContractStatus,
	deriveUnitStatuses,
	getContractPaymentSummary
} from '$lib/contract/contract';
import { groupPaymentsByContractId } from '$lib/payment/payment';
import { eq, inArray } from 'drizzle-orm';

/**
 * RECONCILE
 *
 * recomputes contract and unit statuses and the contract payment aggregates from dates
 * and payments and writes the result back. Must run after any mutation touching
 * contracts, payments, or assignments, or the stored derived state goes stale — reads
 * return these columns as-is. (`sync` means remote exclusively; this local recomputation
 * never is.)
 */
export async function reconcile(db: Database, now: number) {
	const contracts = await db.select().from(s.contract);
	const contractIds = contracts.map((contract) => contract.id);
	const payments = contractIds.length
		? await db.select().from(s.payment).where(inArray(s.payment.contractId, contractIds))
		: [];
	const paymentsByContractId = groupPaymentsByContractId(payments);

	for (const contract of contracts) {
		const contractPayments = paymentsByContractId.get(contract.id) ?? [];
		const nextStatus = deriveContractStatus(contract, contractPayments, now);
		const { paidAmount, expectedAmount } = getContractPaymentSummary(contract, contractPayments);

		if (
			nextStatus !== contract.status ||
			paidAmount !== contract.paidAmount ||
			expectedAmount !== contract.expectedAmount
		) {
			await db
				.update(s.contract)
				.set({ status: nextStatus, paidAmount, expectedAmount })
				.where(eq(s.contract.id, contract.id));
		}
	}

	const units = await db.select().from(s.unit);
	const unitIds = units.map((unit) => unit.id);

	if (unitIds.length === 0) {
		return;
	}

	const assignments = await db
		.select({
			unitId: s.contractUnit.unitId,
			contractId: s.contract.id,
			status: s.contract.status,
			start: s.contract.start,
			end: s.contract.end,
			interval: s.contract.interval,
			cost: s.contract.cost
		})
		.from(s.contractUnit)
		.innerJoin(s.contract, eq(s.contractUnit.contractId, s.contract.id))
		.where(inArray(s.contractUnit.unitId, unitIds));

	const statusByUnitId = deriveUnitStatuses(unitIds, assignments, paymentsByContractId, now);

	for (const unit of units) {
		const nextStatus = statusByUnitId.get(unit.id) ?? 'vacant';

		if (nextStatus !== unit.status) {
			await db.update(s.unit).set({ status: nextStatus }).where(eq(s.unit.id, unit.id));
		}
	}
}
