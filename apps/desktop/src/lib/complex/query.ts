import api from '$lib/api/caller';
import { COMPLEX_SORT_COLUMN_IDS, type ComplexSortColumnId } from '$lib/complex/complex';
import { declareMutation, describeOutcomeChange } from '$lib/design/mutation';
import type { SelectionCall } from '@rentable/design/selection.js';
import type { HistoryEntry } from '$lib/history/history';
import { workspacePrefixes } from '$lib/design/query';
import { isRecordId } from '$lib/platform/database/identity';
import type { ListSort } from '@rentable/design/sort.js';
import { LL } from '$lib/i18n/i18n-svelte';
import { createQuery } from '@tanstack/svelte-query';
import { get } from 'svelte/store';

export const keys = {
	all: workspacePrefixes.complexes,
	get: (id: string) => [...workspacePrefixes.complexes, id],
	list: (search: string, sort: ListSort | null) => [
		...workspacePrefixes.complexes,
		'list',
		search,
		sort ? `${sort.columnId}:${sort.direction}` : 'default'
	],
	search: (term: string) => [...workspacePrefixes.complexes, 'search', term],
	// the selection itself, sorted: the same set assembled in a different order is the same
	// question, and two cache entries for it would ask the workspace twice.
	plan: (ids: readonly string[]) => [
		...workspacePrefixes.complexes,
		'plan',
		[...ids].sort().join(',')
	],
	units: {
		all: workspacePrefixes.units,
		get: (id: string) => [...workspacePrefixes.units, 'detail', id],
		getMany: (complexId: string) => [...workspacePrefixes.units, complexId],
		board: (complexId: string, search: string) => [
			...workspacePrefixes.units,
			'board',
			complexId,
			search
		],
		plan: (ids: readonly string[]) => [
			...workspacePrefixes.units,
			'plan',
			[...ids].sort().join(',')
		],
		search: (term: string) => [...workspacePrefixes.units, 'search', term]
	}
} as const;

/** Why a record in a selection would be turned away, read off the procedure rather than restated. */
export type ComplexRefusalReason = Awaited<
	ReturnType<typeof api.complex.planMany>
>['refused'][number]['reason'];

export type UnitRefusalReason = Awaited<
	ReturnType<typeof api.complex.units.planMany>
>['refused'][number]['reason'];

const toIds = (records: readonly { id: string }[]) => records.map((record) => record.id);

/**
 * One line on one record's own account.
 *
 * A multi-record action writes one of these per record it changed, named the way a reader knows
 * one: a selection is how the reader acted, and a record's history is about the record.
 */
const toHistoryEntry = (
	concept: 'complex' | 'unit',
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

/** The units a palette search reaches, across every complex. */
export function useSearchUnits(term: () => string, limit: number) {
	return createQuery(() => {
		const trimmed = term().trim();

		return {
			queryKey: keys.units.search(trimmed),
			enabled: trimmed.length > 0,
			queryFn: () => api.complex.units.search({ term: trimmed, limit }),
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
 * The occupancy board for one complex: every unit it holds, in the board's own order, each
 * carrying the tenant occupying it. The board has no sort control — its order is what makes
 * it a board — so the search is all the reader varies.
 */
export function useListUnits(complexId: () => string, search: () => string = () => '') {
	return createQuery(() => {
		const id = complexId();
		const trimmedSearch = search().trim();

		return {
			queryKey: keys.units.board(id, trimmedSearch),
			queryFn: () =>
				api.complex.units.getMany({ complexId: id, search: trimmedSearch || undefined }),
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

/**
 * What deleting the units named would do, before it is done.
 *
 * **This is the reading no row could have replaced.** A unit row carries a status derived from
 * what holds it today, and a unit is refused for holding any assignment ever, so a unit with a
 * contract starting next month is on screen as vacant and cannot be deleted.
 */
export function usePlanManyUnits(ids: () => readonly string[]) {
	return createQuery(() => {
		const named = [...ids()];

		return {
			queryKey: keys.units.plan(named),
			enabled: named.length > 0,
			queryFn: () => api.complex.units.planMany({ ids: named })
		};
	});
}

export function useFetchComplexes() {
	return createQuery(() => ({
		queryKey: keys.all,
		queryFn: () => api.complex.getMany({})
	}));
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

/** One unit and the complex holding it. */
export function useFetchUnit(id: () => string) {
	return createQuery(() => {
		const freshId = id();

		return {
			queryKey: keys.units.get(freshId),
			queryFn: () => api.complex.units.get({ id: freshId }),
			enabled: isRecordId(freshId)
		};
	});
}

export function useFetchUnits(complexId: () => string, enabled: () => boolean = () => true) {
	return createQuery(() => {
		const id = complexId();

		return {
			queryKey: keys.units.getMany(id),
			enabled: enabled(),
			queryFn: () => api.complex.units.getMany({ complexId: id })
		};
	});
}

export const useCreateComplex = declareMutation({
	mutate: (data: Parameters<typeof api.complex.create>[0]) => api.complex.create(data),
	touches: ['complexes', 'units'],
	inverse: ({ result }) => ({
		describe: (t) => t.common.undo.created({ record: t.common.labels.complex() }),
		// the units go first: a complex still holding units refuses to be deleted, which is the
		// rule that lets an inverse be a single insert everywhere else.
		undo: async () => {
			for (const unit of result.units) {
				await api.complex.units.delete({ id: unit.id });
			}

			await api.complex.delete({ id: result.id });
		},
		redo: () => api.complex.create(result)
	}),
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
	touches: ['complexes'],
	inverse: ({ result }) =>
		result && {
			describe: (t) => t.common.undo.deleted({ record: t.common.labels.complex() }),
			undo: () => api.complex.create(result),
			redo: () => api.complex.delete({ id: result.id })
		},
	toast: {
		success: () => get(LL).complexes.hooks.deleteSuccess(),
		error: false,
		unexpected: () => get(LL).common.messages.unexpectedError()
	}
});

/**
 * Delete every complex in the selection that holds no unit, as one change.
 *
 * **Taking it back is all or nothing.** The inverse creates the whole set in one batch and throws
 * where any one of them cannot be put back, rather than restoring what it can and naming the
 * rest, which would leave the workspace in a shape neither the deletion nor the undo describes.
 * An inverse that throws stays on the stack, so the reader can deal with whatever refused it and
 * press undo again.
 *
 * The rows themselves are what the procedure answers with, because putting a record back means
 * putting it back as itself, by the identity it had (ADR 0026).
 */
export const useDeleteManyComplexes = declareMutation({
	mutate: ({ ids }: SelectionCall) => api.complex.deleteMany({ ids }),
	touches: ['complexes'],
	inverse: ({ result }) =>
		// nothing changed, so there is nothing to offer taking back. An undo entry for a no-op is a
		// control that appears to have done something.
		result.deleted.length === 0
			? undefined
			: {
					describe: (t) => t.common.undo.deletedMany({ count: result.deleted.length }),
					undo: () => api.complex.createMany({ complexes: result.deleted }),
					redo: () => api.complex.deleteMany({ ids: toIds(result.deleted) }),
					records: (direction) =>
						result.deleted.map((complex) =>
							toHistoryEntry('complex', complex, direction === 'undo' ? 'created' : 'deleted')
						)
				},
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

/**
 * Delete every unit in the selection that no contract has ever held, as one change.
 *
 * The complex's own carries the reasoning; this is the same shape one level down. `touches` names
 * complexes too, because a complex's row shows how many units it holds and how many stand vacant.
 */
export const useDeleteManyUnits = declareMutation({
	mutate: ({ ids }: SelectionCall) => api.complex.units.deleteMany({ ids }),
	touches: ['units', 'complexes'],
	inverse: ({ result }) =>
		result.deleted.length === 0
			? undefined
			: {
					describe: (t) => t.common.undo.deletedMany({ count: result.deleted.length }),
					undo: () => api.complex.units.createMany({ units: result.deleted }),
					redo: () => api.complex.units.deleteMany({ ids: toIds(result.deleted) }),
					records: (direction) =>
						result.deleted.map((unit) =>
							toHistoryEntry('unit', unit, direction === 'undo' ? 'created' : 'deleted')
						)
				},
	records: ({ result }) => result.deleted.map((unit) => toHistoryEntry('unit', unit, 'deleted')),
	notice: ({ variables, result }) =>
		describeOutcomeChange(variables.foreseen, result.refused, (refusal) => refusal.name.trim()),
	toast: {
		success: ({ result }) =>
			result.deleted.length > 0
				? get(LL).complexes.hooks.unitDeleteManySuccess({ count: result.deleted.length })
				: undefined,
		error: true,
		unexpected: () => get(LL).common.messages.unexpectedError()
	}
});

export const useCreateUnit = declareMutation({
	mutate: (data: Parameters<typeof api.complex.units.create>[0]) => api.complex.units.create(data),
	touches: ['units'],
	inverse: ({ result }) => ({
		describe: (t) => t.common.undo.created({ record: t.common.labels.unit() }),
		undo: () => api.complex.units.delete({ id: result.id }),
		redo: () => api.complex.units.create(result)
	}),
	toast: {
		success: () => get(LL).complexes.hooks.unitCreateSuccess(),
		error: false,
		unexpected: () => get(LL).common.messages.unexpectedError()
	}
});

/**
 * Create every unit named, as one change.
 *
 * **One call, one batch, one entry on the undo stack.** Eighteen units named in one line are
 * eighteen rows written inside one transaction, and taking it back removes all eighteen rather
 * than eighteen presses removing one each, which is the shape the deletions in this effort
 * take, arrived at from the other direction.
 *
 * The rows are what the procedure answers with, so applying the change again puts them back
 * under the identities the first creation assigned (ADR 0026).
 *
 * The refusal is not toasted: it is a name already taken, and the form naming it has a line for
 * that under the field the reader would fix.
 *
 * **A unit the workspace refuses to remove leaves the undo partial**, which is the property
 * every bulk inverse here already has: `deleteMany` reports what it turned away rather than
 * throwing, and a unit can only be turned away by having gained a contract since it was created,
 * which needs another device to have assigned it.
 */
export const useCreateManyUnits = declareMutation({
	mutate: (data: Parameters<typeof api.complex.units.createMany>[0]) =>
		api.complex.units.createMany(data),
	touches: ['units', 'complexes'],
	inverse: ({ result }) => ({
		describe: (t) => t.common.undo.createdMany({ count: result.length }),
		undo: () => api.complex.units.deleteMany({ ids: toIds(result) }),
		redo: () => api.complex.units.createMany({ units: result }),
		records: (direction) =>
			result.map((unit) =>
				toHistoryEntry('unit', unit, direction === 'undo' ? 'deleted' : 'created')
			)
	}),
	records: ({ result }) => result.map((unit) => toHistoryEntry('unit', unit, 'created')),
	toast: {
		success: ({ result }) =>
			get(LL).complexes.hooks.unitCreateManySuccess({ count: result.length }),
		error: false,
		unexpected: () => get(LL).common.messages.unexpectedError()
	}
});

export const useUpdateUnit = declareMutation({
	mutate: (values: Parameters<typeof api.complex.units.update>[0]) =>
		api.complex.units.update(values),
	touches: ['units'],
	capture: (variables) => api.complex.units.get({ id: variables.id }),
	inverse: ({ variables, captured }) =>
		captured && {
			describe: (t) => t.common.undo.edited({ record: t.common.labels.unit() }),
			undo: () => api.complex.units.update(captured),
			redo: () => api.complex.units.update(variables)
		},
	toast: {
		success: () => get(LL).complexes.hooks.unitUpdateSuccess(),
		error: false,
		unexpected: () => get(LL).common.messages.unexpectedError()
	}
});

export const useDeleteUnit = declareMutation({
	mutate: (id: string) => api.complex.units.delete({ id }),
	touches: ['units'],
	inverse: ({ result }) =>
		result && {
			describe: (t) => t.common.undo.deleted({ record: t.common.labels.unit() }),
			undo: () => api.complex.units.create(result),
			redo: () => api.complex.units.delete({ id: result.id })
		},
	toast: {
		success: () => get(LL).complexes.hooks.unitDeleteSuccess(),
		error: false,
		unexpected: () => get(LL).common.messages.unexpectedError()
	}
});
