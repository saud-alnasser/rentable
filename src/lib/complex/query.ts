import api from '$lib/api/caller';
import { COMPLEX_SORT_COLUMN_IDS, type ComplexSortColumnId } from '$lib/complex/complex';
import { declareMutation } from '$lib/design/mutation';
import { workspacePrefixes } from '$lib/design/query';
import type { ListSort } from '$lib/design/sort';
import { LL } from '$lib/i18n/i18n-svelte';
import { createQuery } from '@tanstack/svelte-query';
import { get } from 'svelte/store';

export const keys = {
	all: workspacePrefixes.complexes,
	get: (id: number) => [...workspacePrefixes.complexes, id],
	list: (search: string, sort: ListSort | null) => [
		...workspacePrefixes.complexes,
		'list',
		search,
		sort ? `${sort.columnId}:${sort.direction}` : 'default'
	],
	units: {
		all: workspacePrefixes.units,
		get: (id: number) => [...workspacePrefixes.units, 'detail', id],
		getMany: (complexId: number) => [...workspacePrefixes.units, complexId],
		board: (complexId: number, search: string) => [
			...workspacePrefixes.units,
			'board',
			complexId,
			search
		]
	}
} as const;

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
export function useListUnits(complexId: () => number, search: () => string = () => '') {
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

export function useFetchComplexes() {
	return createQuery(() => ({
		queryKey: keys.all,
		queryFn: () => api.complex.getMany({})
	}));
}

export function useFetchComplex(id: () => number) {
	return createQuery(() => {
		const freshId = id();

		return {
			queryKey: keys.get(freshId),
			queryFn: () => api.complex.get({ id: freshId })
		};
	});
}

/** One unit and the complex holding it. */
export function useFetchUnit(id: () => number) {
	return createQuery(() => {
		const freshId = id();

		return {
			queryKey: keys.units.get(freshId),
			queryFn: () => api.complex.units.get({ id: freshId }),
			enabled: Number.isInteger(freshId) && freshId > 0
		};
	});
}

export function useFetchUnits(complexId: () => number) {
	return createQuery(() => {
		const id = complexId();

		return {
			queryKey: keys.units.getMany(id),
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
	mutate: (id: number) => api.complex.delete({ id }),
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
	mutate: (id: number) => api.complex.units.delete({ id }),
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
