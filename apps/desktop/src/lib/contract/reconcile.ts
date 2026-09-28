import type { Contributed } from '$lib/api/contribution';
import type { Context, Database } from '$lib/api/context';
import * as s from '$lib/platform/database/schema';
import {
	deriveContractStatus,
	deriveUnitStatuses,
	getContractPaymentSummary,
	type ContractAssignment
} from '$lib/contract/contract';
import { eq, inArray } from 'drizzle-orm';

/**
 * RECONCILE
 *
 * recomputes contract and unit statuses and the contract payment aggregates from dates
 * and payments and writes the result back — reads return these columns as-is, so a
 * mutation that skips this shows wrong data, not merely stale data. Split by trigger,
 * never by rule: a mutation reconciles only its touch-set through `reconcileTouched`,
 * while `reconcile` walks the whole table for the triggers that have no touch-set —
 * startup, a UTC-day crossing while the app runs, and a remote-sync pull. (`sync` means
 * remote exclusively; this local recomputation never is.)
 *
 * **The payments are read through what the payment contributes** (`paymentsOf`), since the payment
 * depends on the contract and not the other way round: a pass is handed a procedure's context, and
 * reads them from its contributions as it runs.
 */

/** what a pass reads through: the database, and what the features contribute. */
export type Settling = { db: Database } & Contributed;

type DbContract = typeof s.contract.$inferSelect;
type DbUnit = typeof s.unit.$inferSelect;
type DbPayment = typeof s.payment.$inferSelect;

/**
 * the rows a mutation touched: the contracts it changed, plus any unit it detached from
 * them — a removed unit is no longer reachable through the contract's assignments, so the
 * caller must name it.
 */
export type TouchSet = {
	contractIds: string[];
	unitIds?: string[];
};

async function writeContractDerivedState(
	db: Database,
	now: number,
	contracts: DbContract[],
	paymentsByContractId: Map<string, DbPayment[]>
) {
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
}

async function writeUnitDerivedState(
	db: Database,
	now: number,
	units: DbUnit[],
	assignments: ContractAssignment[],
	paymentsByContractId: Map<string, DbPayment[]>
) {
	const unitIds = units.map((unit) => unit.id);
	const statusByUnitId = deriveUnitStatuses(unitIds, assignments, paymentsByContractId, now);

	for (const unit of units) {
		const nextStatus = statusByUnitId.get(unit.id) ?? 'vacant';

		if (nextStatus !== unit.status) {
			await db.update(s.unit).set({ status: nextStatus }).where(eq(s.unit.id, unit.id));
		}
	}
}

async function selectAssignmentsForUnits(db: Database, unitIds: string[]) {
	return await db
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
}

/** the whole-table pass — for startup, a UTC-day crossing, and a remote-sync pull. */
export async function reconcile(ctx: Settling, now: number) {
	const { db } = ctx;
	const contracts = await db.select().from(s.contract);
	const contractIds = contracts.map((contract) => contract.id);
	const paymentsByContractId = await ctx.contributions.contract.paymentsOf(db, contractIds);

	await writeContractDerivedState(db, now, contracts, paymentsByContractId);

	const units = await db.select().from(s.unit);

	if (units.length === 0) {
		return;
	}

	const assignments = await selectAssignmentsForUnits(
		db,
		units.map((unit) => unit.id)
	);

	await writeUnitDerivedState(db, now, units, assignments, paymentsByContractId);
}

/**
 * the mutation pass — reconciles only the touch-set's closure: the touched contracts,
 * their payments, their assignments, the units those assignments name (plus any unit the
 * caller detached), those units' other assignments, and those assignments' payments.
 * Cost is bounded by what the mutation touched, never by table size.
 */
export async function reconcileTouched(ctx: Settling, now: number, touch: TouchSet) {
	const { db } = ctx;
	const contractIds = [...new Set(touch.contractIds)];
	const contracts = contractIds.length
		? await db.select().from(s.contract).where(inArray(s.contract.id, contractIds))
		: [];
	const contractAssignments = contractIds.length
		? await db
				.select({ unitId: s.contractUnit.unitId })
				.from(s.contractUnit)
				.where(inArray(s.contractUnit.contractId, contractIds))
		: [];
	const unitIds = [
		...new Set([
			...contractAssignments.map((assignment) => assignment.unitId),
			...(touch.unitIds ?? [])
		])
	];

	const paymentsByContractId = await ctx.contributions.contract.paymentsOf(db, contractIds);

	await writeContractDerivedState(db, now, contracts, paymentsByContractId);

	if (unitIds.length === 0) {
		return;
	}

	const units = await db.select().from(s.unit).where(inArray(s.unit.id, unitIds));
	const assignments = await selectAssignmentsForUnits(db, unitIds);

	// the touched units' other assignments bring in contracts the touch-set did not load;
	// their payments complete the closure the unit derivation reads.
	const loadedContractIds = new Set(contractIds);
	const otherContractIds = [
		...new Set(
			assignments
				.map((assignment) => assignment.contractId)
				.filter((contractId) => !loadedContractIds.has(contractId))
		)
	];
	const otherPayments = await ctx.contributions.contract.paymentsOf(db, otherContractIds);

	for (const [contractId, contractPayments] of otherPayments) {
		paymentsByContractId.set(contractId, contractPayments);
	}

	await writeUnitDerivedState(db, now, units, assignments, paymentsByContractId);
}

/**
 * Each unit's status as the contracts holding it derive it now, by the unit's id: what the contract
 * contributes to the unit, whose procedures the complex's router serves (`UnitContributions` in
 * `$lib/complex`). A unit no contract holds is absent. The same derivation a pass writes back,
 * read rather than written.
 */
export async function unitStatuses(
	ctx: Pick<Context, 'db' | 'clock'> & Contributed,
	unitIds: string[]
) {
	const assignments = await selectAssignmentsForUnits(ctx.db, unitIds);
	const contractIds = [...new Set(assignments.map((assignment) => assignment.contractId))];
	const paymentsByContractId = await ctx.contributions.contract.paymentsOf(ctx.db, contractIds);

	return deriveUnitStatuses(unitIds, assignments, paymentsByContractId, ctx.clock.now());
}
