import { workspacePrefixes } from '$lib/design/query';
import type { TranslationFunctions } from '$lib/i18n/i18n-types';

/**
 * HISTORY
 *
 * what an entry in a record's account is made of, and where its reads are cached.
 *
 * It sits in the concept rather than beside the mutation declaration that writes it, because
 * both sides need it: the declaration says what to record, and the surface says what to read.
 * A type owned by one of them would make the other import its writer or its reader.
 */

/** which kind of record an entry is about. */
export type HistoryConcept = 'tenant' | 'complex' | 'unit' | 'contract' | 'payment';

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
	recordId: number;
	action: HistoryAction;
	record: string;
};

/**
 * the key sits under the contract tree because the workspace invalidation covers that prefix.
 *
 * An entry is appended *after* that invalidation has already run, though — it is deliberately
 * not awaited into the change it describes — so whoever appends one invalidates this key again
 * afterwards. Without that a surface showing the account reads it one change behind.
 */
export const historyKeys = {
	all: [...workspacePrefixes.contracts, 'history'],
	getMany: (concept: HistoryConcept, recordId: number, search = '') => [
		...workspacePrefixes.contracts,
		'history',
		concept,
		recordId,
		search
	]
} as const;
