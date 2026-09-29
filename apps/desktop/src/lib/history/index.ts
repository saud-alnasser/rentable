/**
 * The history capability: what was done to a record, appended as a mutation lands and read back
 * on the record's own surface. A mutation hands it `HistoryEntry` values and invalidates
 * `historyKeys` once they are written, and the composition root provides the prefix those keys
 * sit under. This file is its whole API but for the record's
 * history itself, which a surface renders through `ui.ts`; a concept imports `$lib/history` or
 * `$lib/history/ui` and never a file inside it.
 */
export {
	historyKeys,
	provideHistoryPrefix,
	type HistoryAction,
	type HistoryConcept,
	type HistoryEntry
} from './history';
