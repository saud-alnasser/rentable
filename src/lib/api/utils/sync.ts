import * as s from '$lib/api/database/schema';
import { deriveContractStatus, deriveUnitStatus } from '$lib/api/utils/contract-status';
import { eq, inArray } from 'drizzle-orm';

export type DbClient = typeof import('$lib/api/database/mod').db;

type DbContract = typeof s.contract.$inferSelect;
type DbPayment = typeof s.payment.$inferSelect;

type ContractAssignmentRow = {
	unitId: number;
	contractId: number;
	status: DbContract['status'];
	start: DbContract['start'];
	end: DbContract['end'];
	interval: DbContract['interval'];
	cost: DbContract['cost'];
};

function groupPaymentsByContractId(payments: DbPayment[]) {
	const paymentsByContractId = new Map<number, DbPayment[]>();

	for (const payment of payments) {
		paymentsByContractId.set(payment.contractId, [
			...(paymentsByContractId.get(payment.contractId) ?? []),
			payment
		]);
	}

	return paymentsByContractId;
}

function getDerivedUnitStatuses(
	unitIds: number[],
	assignments: ContractAssignmentRow[],
	paymentsByContractId: Map<number, DbPayment[]>
) {
	const assignmentsByUnitId = new Map<
		number,
		Array<{
			contract: Pick<DbContract, 'status' | 'start' | 'end' | 'interval' | 'cost'>;
			payments: DbPayment[];
		}>
	>();

	for (const assignment of assignments) {
		assignmentsByUnitId.set(assignment.unitId, [
			...(assignmentsByUnitId.get(assignment.unitId) ?? []),
			{
				contract: {
					status: assignment.status,
					start: assignment.start,
					end: assignment.end,
					interval: assignment.interval,
					cost: assignment.cost
				},
				payments: paymentsByContractId.get(assignment.contractId) ?? []
			}
		]);
	}

	return new Map(
		unitIds.map((unitId) => [unitId, deriveUnitStatus(assignmentsByUnitId.get(unitId) ?? [])])
	);
}

export async function sync(db: DbClient, now = Date.now()) {
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

	const statusByUnitId = getDerivedUnitStatuses(unitIds, assignments, paymentsByContractId);

	for (const unit of units) {
		const nextStatus = statusByUnitId.get(unit.id) ?? 'vacant';

		if (nextStatus !== unit.status) {
			await db.update(s.unit).set({ status: nextStatus }).where(eq(s.unit.id, unit.id));
		}
	}
}
