import {
	deriveContractStatus,
	deriveUnitStatuses,
	groupPaymentsByContractId
} from '$lib/api/contract';
import type { Database } from '$lib/api/context';
import * as s from '$lib/api/database/schema';
import { eq, inArray } from 'drizzle-orm';

/**
 * RECONCILE
 *
 * recomputes contract and unit statuses from dates and payments and writes the result
 * back. Must run after any mutation touching contracts, payments, or assignments, or
 * statuses go stale. (`sync` means remote exclusively — see CONTEXT.md.)
 */
export async function reconcile(db: Database, now: number) {
	const contracts = await db.select().from(s.contract);
	const contractIds = contracts.map((contract) => contract.id);
	const payments = contractIds.length
		? await db.select().from(s.payment).where(inArray(s.payment.contractId, contractIds))
		: [];
	const paymentsByContractId = groupPaymentsByContractId(payments);

	for (const contract of contracts) {
		const nextStatus = deriveContractStatus(
			contract,
			paymentsByContractId.get(contract.id) ?? [],
			now
		);

		if (nextStatus !== contract.status) {
			await db.update(s.contract).set({ status: nextStatus }).where(eq(s.contract.id, contract.id));
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
