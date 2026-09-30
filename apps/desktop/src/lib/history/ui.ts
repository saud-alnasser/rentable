// The history a record's own surface draws. `component/` stays private (plan, *The canonical
// concept shape*).
import type { Section } from '$lib/feature/surface';
import type { RecordKind } from '$lib/permission';
import RecordHistory from './component/record-history.svelte';

export { RecordHistory };

/**
 * The history, as the section a record's page draws it in: under the history title, and at
 * `?section=history`. A feature whose records show their history places it on its own kind's page
 * from its `surface.ts`, at the `order` it takes among that page's collections, so the capability
 * names no kind of record.
 */
export const historySection = <On extends RecordKind>(on: On, order: number): Section<On> => ({
	on,
	order,
	value: 'history',
	label: (t) => t.common.history.title(),
	component: RecordHistory
});
