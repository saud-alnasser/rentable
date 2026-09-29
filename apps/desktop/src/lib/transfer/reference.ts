import { formatDateInput } from '$lib/date';
import { toImportIdentity } from './import';

/**
 * REFERENCES
 *
 * how a sheet names a record of another sheet: the way a person would, never by a row id. An id
 * is this database's own bookkeeping and means nothing in the workspace the file is read into. A
 * tenant is their national id, a complex is its name, a unit is its complex and its own name, and
 * a contract is its government number or, where it has none, its tenant and the day it started.
 *
 * **These spellings are the file's**, so they are the transfer's rather than any one feature's:
 * the sheet that writes a reference and the sheet that reads it back are different features, and
 * two places composing it separately is two places for them to drift apart. `tauri/src/upgrade/record.rs`
 * composes the same two, for the workbook it writes from an earlier version's records.
 */

/** What separates a complex from the unit inside it, in a reference to that unit. */
const UNIT_SEPARATOR = ' / ';
/** What separates one unit reference from the next, where a contract holds several. */
export const UNIT_LIST_SEPARATOR = '; ';
/** What stands between a tenant and a day, in the reference a contract with no number falls back on. */
const CONTRACT_SEPARATOR = ' @ ';
/** the shape that fallback has, which is how a reference is told from a government number. */
const FALLBACK_REFERENCE = /^\S+ @ \d{4}-\d{2}-\d{2}$/;

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
 * is the next thing a person would say — and two contracts that share both and have no number
 * between them are two contracts this file cannot tell apart. That is a collision, reported
 * with both rows named, and the operator's answer is to give one of them its number.
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
