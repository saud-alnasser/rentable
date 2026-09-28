/**
 * The history capability: what was done to a record, appended as a mutation lands and read back
 * on the record's own surface. A mutation hands it `HistoryEntry` values and invalidates
 * `historyKeys` once they are written. This file is its whole API; a concept imports
 * `$lib/history` and never a file inside it.
 */
export { historyKeys, type HistoryAction, type HistoryConcept, type HistoryEntry } from './history';
