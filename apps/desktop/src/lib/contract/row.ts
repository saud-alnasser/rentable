import type { Database } from '$lib/api/context';
import * as s from '$lib/platform/database/schema';
import { refuse } from '$lib/api/refusal';
import { eq, inArray } from 'drizzle-orm';

/**
 * ROW
 *
 * the rows a contract's procedures read before a rule decides: the contract a procedure is about,
 * the payments recorded against it, and the assignment rows of a set of units joined with the
 * contracts holding them. The contract's router and its sub-concepts' routers assert their rules
 * over the same reads, so the reads are stated once, here.
 */

// fetches the assignment rows (joined with their contracts) for the given units — the
// shape every derivation and overlap rule takes.
export async function selectAssignmentsForUnits(db: Database, unitIds: string[]) {
	if (unitIds.length === 0) {
		return [];
	}

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

// fetches the payment rows registered against a contract, for rules that lock on them.
export async function selectPaymentsForContract(db: Database, contractId: string) {
	return await db.select().from(s.payment).where(eq(s.payment.contractId, contractId));
}

// the contract a unit procedure is about, refused rather than returned absent: every one of
// them reads a rule off it, and there is no answer to give for a contract that is not there.
export async function selectContract(db: Database, contractId: string) {
	const contract = await db.select().from(s.contract).where(eq(s.contract.id, contractId)).get();

	if (!contract) {
		throw refuse('contract.missing');
	}

	return contract;
}
