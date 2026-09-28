import type { TranslationFunctions } from '$lib/i18n/i18n-types';
import type { RecordKind } from '$lib/permission';
import { FAMILIES, type Flag } from '@rentable/workspace-permission';

/**
 * HISTORY
 *
 * what an entry in a record's account is made of, and where its reads are cached.
 *
 * It sits in the concept rather than beside the mutation declaration that writes it, because
 * both sides need it: the declaration says what to record, and the surface says what to read.
 * A type owned by one of them would make the other import its writer or its reader.
 */

/**
 * which kind of record an entry is about: one of the permission package's `RECORD_KINDS`, read
 * off that list rather than spelled again, as the stored `concept` column in
 * `platform/database/schema.ts` is.
 */
export type HistoryConcept = RecordKind;

/**
 * The changes an entry can name.
 *
 * The vocabulary undo already describes changes with, reused rather than restated: the two are
 * naming the same events, and a second list would drift the first time one gained a member.
 */
export type HistoryAction = keyof Pick<
	TranslationFunctions['common']['undo'],
	'assigned' | 'created' | 'deleted' | 'edited' | 'renewed' | 'terminated' | 'unterminated'
>;

/**
 * One thing that happened to one record.
 *
 * The action is the key it renders under rather than a rendered sentence — a history read in
 * Arabic has to answer in Arabic, whatever language the change was made in. The record's name
 * is frozen at the moment it happened, which is what lets a deletion still read afterwards.
 */
export type HistoryEntry = {
	concept: HistoryConcept;
	recordId: string;
	action: HistoryAction;
	record: string;
};

/** Every flag the history asks for: each act on each kind of record it can be about. */
export const HISTORY_FLAGS = [
	...FAMILIES.complex,
	...FAMILIES.unit,
	...FAMILIES.tenant,
	...FAMILIES.contract,
	...FAMILIES.payment
] as const satisfies readonly [Flag, ...Flag[]];

/** What reading a record's history takes: viewing that kind of record. */
export const viewFlagOf = (concept: HistoryConcept): Flag => FAMILIES[concept][0];

/**
 * What appending an entry takes: the act it records, on the kind of record it is about (effort
 * 838). A creation is creating and a deletion deleting; everything else an entry can name,
 * renewing, ending, restoring and assigning included, is an edit of the record.
 */
export function flagOfEntry(entry: { concept: HistoryConcept; action: string }): Flag {
	const [, create, edit, remove] = FAMILIES[entry.concept];

	return entry.action === 'created' ? create : entry.action === 'deleted' ? remove : edit;
}

/**
 * the key sits under the prefix the cache policy keeps for keys of no kind of their own, the
 * contract tree, because the workspace invalidation covers that prefix. Whoever reads a key hands
 * that prefix in (`sharedPrefix` from `$lib/mutation`): this module is loaded by the history's
 * router, which no test can load beside the mutation handlers' toaster.
 *
 * An entry is appended *after* that invalidation has already run, though — it is deliberately
 * not awaited into the change it describes — so whoever appends one invalidates this key again
 * afterwards. Without that a surface showing the account reads it one change behind.
 */
export const historyKeys = {
	all: (under: readonly string[]) => [...under, 'history'],
	getMany: (under: readonly string[], concept: HistoryConcept, recordId: string, search = '') => [
		...under,
		'history',
		concept,
		recordId,
		search
	]
} as const;
