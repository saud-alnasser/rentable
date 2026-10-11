import type { Contract } from '$lib/platform/database/schema';
import { addUtcDays, toUtcDay, type DateLike } from '$lib/date';

/**
 * RECOGNIZE
 *
 * The renewals the application did not link: a contract that names no predecessor, read against
 * every other contract, by the rule in effort 861's requirement 6. It covers renewals made before
 * the link existed, by a build without it, and in a file imported without it. The whole-table
 * reconcile (`contract/reconcile.ts`) writes what this finds, at every recalculation, which is the
 * human's call over a pass that runs once and over inferring the link at read time.
 *
 * **The rule.** A contract, the successor, renews another, its predecessor, where both name the
 * same tenant, the successor starts on the UTC day after the predecessor ends, the two hold the
 * same set of units, and the successor is not terminated. Two contracts holding no units hold the
 * same set, so they match on tenant and day alone: the weaker match the spec accepts (*Risks*).
 *
 * **What is never linked.**
 * - A contract that already names one: a link once written is never moved or removed here.
 * - A predecessor a contract that is not terminated already names, since it is already renewed.
 *   One named only by a terminated contract is not renewed, and may be linked to the one that is.
 * - Either side of an ambiguous match: where a successor would renew more than one contract, or a
 *   predecessor would be renewed by more than one, none of them is linked.
 *
 * Pure: it reads its arguments and changes neither.
 */

/** The fields of a contract the rule reads. */
export type RecognizableContract = Pick<
	Contract,
	'id' | 'tenantId' | 'status' | 'renewsContractId'
> & {
	start: DateLike;
	end: DateLike;
};

/** A link to write: `successorId`'s `renews_contract_id` names `predecessorId`. */
export type RecognizedRenewal = { successorId: string; predecessorId: string };

/**
 * The renewals among `contracts` that no contract records, one per successor.
 *
 * `unitsByContract` holds the ids of the units each contract holds, by the contract's id; a
 * contract absent from it holds none. The order of the result is not meaningful.
 */
export function recognizeRenewals(
	contracts: readonly RecognizableContract[],
	unitsByContract: ReadonlyMap<string, readonly string[]>
): RecognizedRenewal[] {
	const unitsOf = (id: string) => [...new Set(unitsByContract.get(id) ?? [])].sort().join('\u0000');
	// the same tenant, the same units, and the day the next contract would start.
	const keyOf = (tenantId: string, day: number, id: string) =>
		JSON.stringify([tenantId, day, unitsOf(id)]);

	const predecessorsByKey = new Map<string, string[]>();

	for (const contract of contracts) {
		const followingDay = addUtcDays(toUtcDay(contract.end), 1).getTime();
		const key = keyOf(contract.tenantId, followingDay, contract.id);

		predecessorsByKey.set(key, [...(predecessorsByKey.get(key) ?? []), contract.id]);
	}

	// every contract that is not terminated and renews, or would renew, each predecessor: the links
	// already written count, so a renewed predecessor is never given a second.
	const successorsByPredecessor = new Map<string, string[]>();
	const candidates: { successorId: string; predecessors: string[] }[] = [];

	const renews = (predecessorId: string, successorId: string) =>
		successorsByPredecessor.set(predecessorId, [
			...(successorsByPredecessor.get(predecessorId) ?? []),
			successorId
		]);

	for (const contract of contracts) {
		if (contract.status === 'terminated') {
			continue;
		}

		if (contract.renewsContractId !== null) {
			renews(contract.renewsContractId, contract.id);
			continue;
		}

		const startDay = toUtcDay(contract.start).getTime();
		const predecessors = (
			predecessorsByKey.get(keyOf(contract.tenantId, startDay, contract.id)) ?? []
		).filter((id) => id !== contract.id);

		for (const predecessorId of predecessors) {
			renews(predecessorId, contract.id);
		}

		candidates.push({ successorId: contract.id, predecessors });
	}

	return candidates.flatMap(({ successorId, predecessors }) => {
		if (predecessors.length !== 1) {
			return [];
		}

		const [predecessorId] = predecessors;

		return successorsByPredecessor.get(predecessorId)?.length === 1
			? [{ successorId, predecessorId }]
			: [];
	});
}
