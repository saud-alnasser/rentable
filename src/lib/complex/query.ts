import api from '$lib/api/caller';
import { COMPLEX_SORT_COLUMN_IDS, type ComplexSortColumnId } from '$lib/complex/complex';
import { onMutationError, onMutationSuccess, type MutationOptions } from '$lib/design/mutation';
import { invalidateWorkspaceData, workspacePrefixes } from '$lib/design/query';
import type { ListSort } from '$lib/design/sort';
import { LL } from '$lib/i18n/i18n-svelte';
import { createMutation, createQuery, useQueryClient } from '@tanstack/svelte-query';
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

export function useCreateComplex(
	opts: MutationOptions = {
		toast: {
			success: () => get(LL).complexes.hooks.createSuccess(),
			error: false,
			unexpected: () => get(LL).common.messages.unexpectedError()
		}
	}
) {
	const client = useQueryClient();

	return createMutation(() => ({
		mutationFn: (data: Parameters<typeof api.complex.create>[0]) => api.complex.create(data),
		onSuccess: async () => {
			await invalidateWorkspaceData(client);

			onMutationSuccess(opts);
		},
		onError: (e) => onMutationError(opts, e)
	}));
}

export function useUpdateComplex(
	opts: MutationOptions = {
		toast: {
			success: () => get(LL).complexes.hooks.updateSuccess(),
			error: false,
			unexpected: () => get(LL).common.messages.unexpectedError()
		}
	}
) {
	const client = useQueryClient();

	return createMutation(() => ({
		mutationFn: (values: Parameters<typeof api.complex.update>[0]) => api.complex.update(values),
		onSuccess: async () => {
			await invalidateWorkspaceData(client);

			onMutationSuccess(opts);
		},
		onError: (e) => onMutationError(opts, e)
	}));
}

export function useDeleteComplex(
	opts: MutationOptions = {
		toast: {
			success: () => get(LL).complexes.hooks.deleteSuccess(),
			error: false,
			unexpected: () => get(LL).common.messages.unexpectedError()
		}
	}
) {
	const client = useQueryClient();

	return createMutation(() => ({
		mutationFn: (id: number) => api.complex.delete({ id }),
		onSuccess: async () => {
			await invalidateWorkspaceData(client);

			onMutationSuccess(opts);
		},
		onError: (e) => onMutationError(opts, e)
	}));
}

export function useCreateUnit(
	opts: MutationOptions = {
		toast: {
			success: () => get(LL).complexes.hooks.unitCreateSuccess(),
			error: false,
			unexpected: () => get(LL).common.messages.unexpectedError()
		}
	}
) {
	const client = useQueryClient();

	return createMutation(() => ({
		mutationFn: (data: Parameters<typeof api.complex.units.create>[0]) =>
			api.complex.units.create(data),
		onSuccess: async () => {
			await invalidateWorkspaceData(client);

			onMutationSuccess(opts);
		},
		onError: (e) => onMutationError(opts, e)
	}));
}

export function useUpdateUnit(
	opts: MutationOptions = {
		toast: {
			success: () => get(LL).complexes.hooks.unitUpdateSuccess(),
			error: false,
			unexpected: () => get(LL).common.messages.unexpectedError()
		}
	}
) {
	const client = useQueryClient();

	return createMutation(() => ({
		mutationFn: (values: Parameters<typeof api.complex.units.update>[0]) =>
			api.complex.units.update(values),
		onSuccess: async () => {
			await invalidateWorkspaceData(client);

			onMutationSuccess(opts);
		},
		onError: (e) => onMutationError(opts, e)
	}));
}

export function useDeleteUnit(
	opts: MutationOptions = {
		toast: {
			success: () => get(LL).complexes.hooks.unitDeleteSuccess(),
			error: false,
			unexpected: () => get(LL).common.messages.unexpectedError()
		}
	}
) {
	const client = useQueryClient();

	return createMutation(() => ({
		mutationFn: (id: number) => api.complex.units.delete({ id }),
		onSuccess: async (deleted) => {
			if (deleted) {
				await invalidateWorkspaceData(client);
			}

			onMutationSuccess(opts);
		},
		onError: (e) => onMutationError(opts, e)
	}));
}
