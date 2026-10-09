import type { Database } from '$lib/api/context';
import * as s from '$lib/platform/database/schema';
import { refuse } from '$lib/api/refusal';
import { and, eq, inArray, ne, sql } from 'drizzle-orm';

/**
 * ROW
 *
 * the rows a contract's procedures read before a rule decides: the contract a procedure is about,
 * the payments recorded against it, the assignment rows of a set of units joined with the
 * contracts holding them, and whether a contract is renewed. The contract's router and its
 * sub-concepts' routers assert their rules over the same reads, so the reads are stated once, here.
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

/**
 * Whether the contract a statement reads is _renewed_: a successor that still stands names it
 * as the contract it renews (effort 861, requirements 5 and 7). Standing means not terminated and
 * not retired. A successor retired by a merge is kept out of the subquery by the statement rewrite
 * every client applies (`platform/database/retired`), so no condition here names it, and a deleted
 * one is not there to find. Never stored, so terminating or deleting the successor puts the
 * contract back up for renewal with nothing to reconcile. The one expression of it, for every read
 * that asks.
 *
 * The contract it asks about is named `"contract"."id"` in full rather than through the column:
 * drizzle writes a column of a select over one table without its table, and an unqualified `"id"`
 * inside the subquery is the successor's own. So a read using it reads `contract` by that name,
 * never under an alias.
 */
export const renewedColumn = sql<boolean>`exists (
	select 1 from "contract" as "successor"
	where "successor"."renews_contract_id" = "contract"."id"
		and "successor"."status" <> 'terminated'
)`.mapWith(Boolean);

// whether a contract is renewed, read for a rule that refuses it. A contract that is not there is
// not renewed; the read that refuses a missing one is `selectContract`.
export async function isContractRenewed(db: Database, contractId: string) {
	const read = await db
		.select({ renewed: renewedColumn })
		.from(s.contract)
		.where(eq(s.contract.id, contractId))
		.get();

	return read?.renewed ?? false;
}

/**
 * The contracts holding any of `govIds`, leaving out the contract `except` names, which is the one
 * being edited.
 *
 * **The app keeps a government ID unique, not the database** (effort 857, requirement 14): the
 * shared database refused one machine's changes over an ID another saved while apart, and the
 * engine dropped them. So every save that could take one reads who holds it through here, and
 * what counts as holding one is decided once. A contract retired by a merge holds nothing: the
 * statement rewrite every client applies keeps it out of this read (`platform/database/retired`),
 * so no condition here names it.
 */
export async function contractsHoldingGovId(
	db: Database,
	govIds: readonly string[],
	except?: string
) {
	if (govIds.length === 0) {
		return [];
	}

	return await db
		.select()
		.from(s.contract)
		.where(
			and(
				inArray(s.contract.govId, [...govIds]),
				except === undefined ? undefined : ne(s.contract.id, except)
			)
		);
}
