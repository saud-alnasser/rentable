import { formatDateInput } from '$lib/date';
import { toImportIdentity } from './import';

/**
 * REFERENCES
 *
 * how a sheet names a record of another sheet: the way a person would, never by a row id. An id
 * is this database's own bookkeeping and means nothing in the workspace the file is read into. A
 * tenant is their national id, a complex is its name, a unit is its complex and its own name, and
 * a contract is its government number or, where it has none, its tenant and the day it started,
 * spelled further only where another contract shares both (`toContractReferences`).
 *
 * **These spellings are the file's**, so they are the transfer's rather than any one feature's:
 * the sheet that writes a reference and the sheet that reads it back are different features, and
 * two places composing it separately is two places for them to drift apart. `tauri/src/upgrade/record.rs`
 * composes the same, for the workbook it writes from an earlier version's records.
 */

/** What separates a complex from the unit inside it, in a reference to that unit. */
const UNIT_SEPARATOR = ' / ';
/** What separates one unit reference from the next, where a contract holds several. */
export const UNIT_LIST_SEPARATOR = '; ';
/** What stands between a tenant and a day, in the reference a contract with no number falls back on. */
const CONTRACT_SEPARATOR = ' @ ';
/** What stands between the day a term started and the day it ends, where the start is not enough. */
const END_SEPARATOR = '..';
/** What stands before the ordinal, where the whole term is not enough either. */
const ORDINAL_SEPARATOR = ' #';
/**
 * the shape that fallback has, in each of its three spellings, which is how a reference is told
 * from a government number: the bare tenant and day, then the end day, then an ordinal.
 */
const FALLBACK_REFERENCE = /^\S+ @ \d{4}-\d{2}-\d{2}(\.\.\d{4}-\d{2}-\d{2})?( #\d+)?$/;

/** What a file calls one unit: the complex holding it, and its own name. */
export function toUnitReference(complex: string, unit: string) {
	return `${complex.trim()}${UNIT_SEPARATOR}${unit.trim()}`;
}

/**
 * The complex and the unit a reference names.
 *
 * Split at the *last* separator, so a complex whose own name contains one still resolves — a
 * unit's name is the tail, and it is the half far more likely to be a plain number.
 */
export function toUnitParts(reference: string): [string, string] {
	const at = reference.lastIndexOf(UNIT_SEPARATOR);

	return at === -1
		? ['', reference.trim()]
		: [reference.slice(0, at).trim(), reference.slice(at + UNIT_SEPARATOR.length).trim()];
}

/**
 * What a file calls one contract.
 *
 * The government number, which is what a person calls a contract and is unique where it is
 * present. Where it is absent the fallback is the tenant and the day the term started, which
 * is the next thing a person would say. Two contracts that share both and have no number between
 * them would share this too, so a reference written to a file is composed over the whole set by
 * `toContractReferences`, which spells those further; this is the spelling of one contract alone.
 */
export function toContractReference(contract: {
	govId?: string | null;
	tenant: string;
	start: number | Date;
}) {
	const stated = contract.govId?.trim();

	return (
		stated || `${contract.tenant.trim()}${CONTRACT_SEPARATOR}${formatDateInput(contract.start)}`
	);
}

/**
 * What a file calls each contract of a set, by its id: a reference only that contract answers to.
 *
 * A contract with a number, or one unique by its tenant and the day its term started, is called
 * exactly what `toContractReference` calls it, so every reference a file could have named before
 * resolves the same way. Only numberless contracts sharing a tenant and a day are spelled further:
 * each adds the day its term ends, and those that share that day too add an ordinal, counted in
 * order of id. Ids are minted in time order, and an import writes its rows in file order, so the
 * ordinal is creation order and holds across an export read back in.
 *
 * Over the whole set, never a filtered part of it: whether a contract needs more than the bare
 * spelling depends on every other contract the workspace holds.
 */
export function toContractReferences(
	contracts: readonly {
		id: string;
		govId?: string | null;
		tenant: string;
		start: number | Date;
		end: number | Date;
	}[]
) {
	const references = new Map<string, string>();
	const sharing = new Map<string, (typeof contracts)[number][]>();

	for (const contract of contracts) {
		const reference = toContractReference(contract);

		references.set(contract.id, reference);

		if (!contract.govId?.trim()) {
			const key = toTransferKey(reference);

			sharing.set(key, [...(sharing.get(key) ?? []), contract]);
		}
	}

	for (const group of sharing.values()) {
		if (group.length < 2) {
			continue;
		}

		const ending = new Map<string, (typeof contracts)[number][]>();

		for (const contract of group) {
			const reference = `${references.get(contract.id)}${END_SEPARATOR}${formatDateInput(contract.end)}`;

			references.set(contract.id, reference);
			ending.set(reference, [...(ending.get(reference) ?? []), contract]);
		}

		for (const [reference, same] of ending) {
			if (same.length < 2) {
				continue;
			}

			[...same]
				.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
				.forEach((contract, index) =>
					references.set(contract.id, `${reference}${ORDINAL_SEPARATOR}${index + 1}`)
				);
		}
	}

	return references;
}

/** The government number a reference carries, or nothing where it is the fallback shape. */
export function toGovIdFromReference(reference: string) {
	const stated = reference.trim();

	return FALLBACK_REFERENCE.test(stated) ? undefined : stated || undefined;
}

/**
 * The key a name matches under.
 *
 * The import pass's own, rather than a second answer to the same question: it is what decides
 * whether two rows are the same record, and a reference that resolved under one rule while the
 * collision check ran under another would let a file both refuse a row and point at it. The
 * router that turns names into identities matches under it too, for the same reason.
 */
export function toTransferKey(...values: string[]) {
	return toImportIdentity(values);
}
