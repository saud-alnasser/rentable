import api from '$lib/api/caller';
import { COMPLEX_SORT_COLUMN_IDS, type ComplexSortColumnId } from '$lib/complex/complex';
import type { RecordFlag } from '$lib/permission';
import { prefixOf } from '$lib/mutation';
import { declareMutation, describeOutcomeChange } from '$lib/mutation/ui';
import type { SelectionCall } from '@rentable/design/selection.js';
import type { HistoryEntry } from '$lib/history';
import type { ListSort } from '@rentable/design/sort.js';
import { LL } from '$lib/i18n/i18n-svelte';
import { createQuery, useQueryClient } from '@tanstack/svelte-query';
import { get } from 'svelte/store';

export const keys = {
	get all() {
		return prefixOf('complex');
	},
	get: (id: string) => [...prefixOf('complex'), id],
	list: (search: string, sort: ListSort | null) => [
		...prefixOf('complex'),
		'list',
		search,
		sort ? `${sort.columnId}:${sort.direction}` : 'default'
	],
	search: (term: string) => [...prefixOf('complex'), 'search', term],
	// the selection itself, sorted: the same set assembled in a different order is the same
	// question, and two cache entries for it would ask the workspace twice.
	plan: (ids: readonly string[]) => [...prefixOf('complex'), 'plan', [...ids].sort().join(',')],
	units: {
		get all() {
			return prefixOf('unit');
		},
		get: (id: string) => [...prefixOf('unit'), 'detail', id],
		getMany: (complexId: string) => [...prefixOf('unit'), complexId],
		board: (complexId: string, search: string, sort: ListSort | null = null) => [
			...prefixOf('unit'),
			'board',
			complexId,
			search,
			sort ? `${sort.columnId}:${sort.direction}` : 'default'
		],
		plan: (ids: readonly string[]) => [...prefixOf('unit'), 'plan', [...ids].sort().join(',')],
		search: (term: string) => [...prefixOf('unit'), 'search', term]
	}
} as const;

// a unit's hooks are its own, in `unit/query.ts`, under the keys above.

/** Why a record in a selection would be turned away, read off the procedure rather than restated. */
export type ComplexRefusalReason = Awaited<
	ReturnType<typeof api.complex.planMany>
>['refused'][number]['reason'];

const toIds = (records: readonly { id: string }[]) => records.map((record) => record.id);

/**
 * What undoing a complex's deletion, and doing it again, ask of the reader: the complex's own
 * flags, and the unit's where units went with it.
 */
const flagsToPutBack = (
	units: readonly unknown[]
): { undo: readonly RecordFlag[]; redo: readonly RecordFlag[] } =>
	units.length === 0
		? { undo: ['createComplex'], redo: ['deleteComplex'] }
		: { undo: ['createComplex', 'createUnit'], redo: ['deleteComplex', 'deleteUnit'] };

/**
 * One line on one record's own account.
 *
 * A multi-record action writes one of these per record it changed, named the way a reader knows
 * one: a selection is how the reader acted, and a record's history is about the record.
 */
const toHistoryEntry = (
	concept: 'complex',
	record: { id: string; name: string },
	action: HistoryEntry['action']
) => ({ concept, recordId: record.id, action, record: record.name });

/** The complexes a palette search reaches. Bounded in SQL; nothing is narrowed again here. */
export function useSearchComplexes(term: () => string, limit: number) {
	return createQuery(() => {
		const trimmed = term().trim();

		return {
			queryKey: keys.search(trimmed),
			enabled: trimmed.length > 0,
			queryFn: () => api.complex.search({ term: trimmed, limit }),
			placeholderData: <T>(previous: T) => previous
		};
	});
}

// the shell's sort carries a bare string, because it is shared by lists that order by
// different keys. This is where it becomes one of this list's own.
function isComplexSortColumnId(columnId: string): columnId is ComplexSortColumnId {
	return (COMPLEX_SORT_COLUMN_IDS as readonly string[]).includes(columnId);
}

/**
 * The complexes directory for a search and an order: the whole result set, each row
 * carrying how many units the complex holds and how many of them stand vacant.
 *
 * `placeholderData` holds the previous set while a new query is in flight, so the list keeps
 * rendering rows instead of flashing through its loading state on every keystroke.
 */
export function useListComplexes(
	search: () => string = () => '',
	sort: () => ListSort | null = () => null
) {
	return createQuery(() => {
		const trimmedSearch = search().trim();
		const chosenSort = sort();

		return {
			queryKey: keys.list(trimmedSearch, chosenSort),
			queryFn: () =>
				api.complex.getMany({
					search: trimmedSearch || undefined,
					sort:
						chosenSort && isComplexSortColumnId(chosenSort.columnId)
							? { columnId: chosenSort.columnId, direction: chosenSort.direction }
							: undefined
				}),
			placeholderData: <T>(previous: T) => previous
		};
	});
}

/**
 * What deleting the complexes named would do, before it is done.
 *
 * Asked of the workspace rather than read off the rows. A complex row does carry `unitCount`, so
 * this is one of the two lists that could preview from what is already on screen; it does not,
 * because an application answering one question two ways is what the effort behind this exists
 * to remove.
 */
export function usePlanManyComplexes(ids: () => readonly string[]) {
	return createQuery(() => {
		const named = [...ids()];

		return {
			queryKey: keys.plan(named),
			enabled: named.length > 0,
			queryFn: () => api.complex.planMany({ ids: named })
		};
	});
}

export function useFetchComplex(id: () => string) {
	return createQuery(() => {
		const freshId = id();

		return {
			queryKey: keys.get(freshId),
			queryFn: () => api.complex.get({ id: freshId })
		};
	});
}

/**
 * Read one complex once, for a caller that holds only its identity and has to act on the rest: the
 * complex host, answering an act the command menu named by id. Under the key `useFetchComplex`
 * reads.
 */
export function useReadComplex() {
	const client = useQueryClient();

	return (id: string) =>
		client.fetchQuery({ queryKey: keys.get(id), queryFn: () => api.complex.get({ id }) });
}

export const useCreateComplex = declareMutation({
	mutate: (data: Parameters<typeof api.complex.create>[0]) => api.complex.create(data),
	touches: ['complexes', 'units'],
	inverse: ({ result }) => {
		// what the undo took away, which the redo puts back: the complex with whatever units it had
		// by then, the ones another device added included, so undoing and redoing loses none of them.
		let removed: Awaited<ReturnType<typeof api.complex.delete>> | undefined;

		return {
			describe: (t) => t.common.undo.created({ record: t.common.labels.complex() }),
			flags: {
				// as the redo does: a complex made with no units is taken back by deleting it alone.
				undo: result.units.length === 0 ? ['deleteComplex'] : ['deleteUnit', 'deleteComplex'],
				redo: result.units.length === 0 ? ['createComplex'] : ['createComplex', 'createUnit']
			},
			// one delete, the units with it, refused where a contract has come to hold one of them.
			undo: async () => {
				removed = await api.complex.delete({ id: result.id });
			},
			redo: () =>
				removed && removed.units.length > 0
					? api.complex.createMany({ complexes: [removed] })
					: api.complex.create(result)
		};
	},
	toast: {
		success: () => get(LL).complexes.hooks.createSuccess(),
		error: false,
		unexpected: () => get(LL).common.messages.unexpectedError()
	}
});

export const useUpdateComplex = declareMutation({
	mutate: (values: Parameters<typeof api.complex.update>[0]) => api.complex.update(values),
	touches: ['complexes'],
	capture: (variables) => api.complex.get({ id: variables.id }),
	inverse: ({ variables, captured }) =>
		captured && {
			describe: (t) => t.common.undo.edited({ record: t.common.labels.complex() }),
			flags: { undo: ['editComplex'], redo: ['editComplex'] },
			undo: () => api.complex.update(captured),
			redo: () => api.complex.update(variables)
		},
	toast: {
		success: () => get(LL).complexes.hooks.updateSuccess(),
		error: false,
		unexpected: () => get(LL).common.messages.unexpectedError()
	}
});

export const useDeleteComplex = declareMutation({
	mutate: (id: string) => api.complex.delete({ id }),
	touches: ['complexes', 'units'],
	inverse: ({ result }) => {
		if (!result) {
			return undefined;
		}

		// what the last deletion took, which the next undo puts back: a redo deletes again, and takes
		// whatever units the complex had come to have by then.
		let removed = result;

		return {
			describe: (t) => t.common.undo.deleted({ record: t.common.labels.complex() }),
			flags: flagsToPutBack(result.units),
			// a complex that took units with it comes back through the restore, which puts each unit
			// back as the row it was; one that took none comes back as it always has.
			undo: () =>
				removed.units.length === 0
					? api.complex.create(removed)
					: api.complex.createMany({ complexes: [removed] }),
			redo: async () => {
				removed = (await api.complex.delete({ id: result.id })) ?? removed;
			}
		};
	},
	toast: {
		success: () => get(LL).complexes.hooks.deleteSuccess(),
		// the announcement says how long it can be taken back, whether or not a dialog asked first:
		// a complex that took its units with it is undone whole, as one with none is.
		detail: () => get(LL).common.undo.lasts(),
		error: false,
		unexpected: () => get(LL).common.messages.unexpectedError()
	}
});

/**
 * Delete every complex in the selection that no contract's hold on a unit refuses, with its
 * units, as one change.
 *
 * **Taking it back is all or nothing.** The inverse creates the whole set in one batch and throws
 * where any one of them cannot be put back, rather than restoring what it can and naming the
 * rest, which would leave the workspace in a shape neither the deletion nor the undo describes.
 * An inverse that throws stays on the stack, so the reader can deal with whatever refused it and
 * press undo again.
 *
 * The rows themselves are what the procedure answers with, each complex with the units that went
 * with it, because putting a record back means putting it back as itself, by the identity it had
 * (ADR 0026).
 */
export const useDeleteManyComplexes = declareMutation({
	mutate: ({ ids }: SelectionCall) => api.complex.deleteMany({ ids }),
	touches: ['complexes', 'units'],
	inverse: ({ result }) =>
		// nothing changed, so there is nothing to offer taking back. An undo entry for a no-op is a
		// control that appears to have done something.
		result.deleted.length === 0
			? undefined
			: (() => {
					// what the last deletion took, which the next undo puts back, as for one complex: a redo
					// is refused whatever a contract has come to hold since, so the undo after it puts back
					// only what it removed, and nothing where it removed nothing.
					let removed = result.deleted;

					return {
						describe: (t) => t.common.undo.deletedMany({ count: removed.length }),
						flags: flagsToPutBack(result.deleted.flatMap((complex) => complex.units)),
						undo: async () => {
							if (removed.length > 0) {
								await api.complex.createMany({ complexes: removed });
							}
						},
						redo: async () => {
							removed = (await api.complex.deleteMany({ ids: toIds(result.deleted) })).deleted;
						},
						records: (direction) =>
							removed.map((complex) =>
								toHistoryEntry('complex', complex, direction === 'undo' ? 'created' : 'deleted')
							)
					};
				})(),
	// the names are frozen here for the reason the whole entry is: a moment later the records are
	// gone, and an account that could only name what still exists could not report a deletion.
	records: ({ result }) =>
		result.deleted.map((complex) => toHistoryEntry('complex', complex, 'deleted')),
	// what it turned away that the confirmation did not show, which is the workspace having
	// moved while the reader was deciding.
	notice: ({ variables, result }) =>
		describeOutcomeChange(variables.foreseen, result.refused, (refusal) => refusal.name.trim()),
	toast: {
		// the count, because it is the one thing about a bulk action a reader cannot see for
		// themselves, and nothing at all where the selection turned out to hold nothing this could
		// be done to. The confirmation has already said why in that case.
		success: ({ result }) =>
			result.deleted.length > 0
				? get(LL).complexes.hooks.deleteManySuccess({ count: result.deleted.length })
				: undefined,
		error: true,
		unexpected: () => get(LL).common.messages.unexpectedError()
	}
});
