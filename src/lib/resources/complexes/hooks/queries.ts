import api from '$lib/api/mod';
import {
	onMutationError,
	onMutationSuccess,
	type MutationOptions
} from '$lib/common/utils/queries';
import { LL } from '$lib/i18n/i18n-svelte';
import {
	createInfiniteQuery,
	createMutation,
	createQuery,
	useQueryClient,
	type InfiniteData
} from '@tanstack/svelte-query';
import { get } from 'svelte/store';

const DATA_VIEW_PAGE_SIZE = 24;
type InfiniteComplexesPage = Awaited<ReturnType<typeof api.complex.getPaginated>>;
type InfiniteUnitsPage = Awaited<ReturnType<typeof api.complex.units.getPaginated>>;

export const keys = {
	all: ['complexes'],
	get: (id: number) => ['complexes', id],
	dataView: (search?: string) => ['complexes', 'data-view', search ?? ''],
	units: {
		all: ['complexes', 'units'],
		get: (id: number) => ['complexes', 'units', 'detail', id],
		getMany: (complexId: number) => ['complexes', 'units', complexId],
		dataView: (complexId: number, search?: string) => [
			'complexes',
			'units',
			'data-view',
			complexId,
			search ?? ''
		]
	}
} as const;

async function invalidateComplexAndContractData(client: ReturnType<typeof useQueryClient>) {
	await Promise.all([
		client.invalidateQueries({ queryKey: keys.all }),
		client.invalidateQueries({ queryKey: ['contracts'] })
	]);
}

async function invalidateComplexUnitsAndContractData(client: ReturnType<typeof useQueryClient>) {
	await Promise.all([
		client.invalidateQueries({ queryKey: keys.units.all }),
		client.invalidateQueries({ queryKey: ['contracts'] })
	]);
}

export function useFetchComplexes() {
	return createQuery(() => ({
		queryKey: keys.all,
		queryFn: () => api.complex.getMany({})
	}));
}

export function useInfiniteComplexes(search: () => string = () => '') {
	return createInfiniteQuery<
		InfiniteComplexesPage,
		Error,
		InfiniteData<InfiniteComplexesPage>,
		ReturnType<typeof keys.dataView>,
		number
	>(() => {
		const trimmedSearch = search().trim();

		return {
			queryKey: keys.dataView(trimmedSearch),
			initialPageParam: 0,
			getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
			queryFn: ({ pageParam }) =>
				api.complex.getPaginated({
					search: trimmedSearch || undefined,
					limit: DATA_VIEW_PAGE_SIZE,
					offset: typeof pageParam === 'number' ? pageParam : 0
				})
		};
	});
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

export function useFetchUnit(id: () => number) {
	return createQuery(() => {
		const freshId = id();

		return {
			queryKey: keys.units.get(freshId),
			queryFn: () => api.complex.units.getMany({ complexId: freshId })
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

export function useInfiniteUnits(params: () => { complexId: number; search?: string }) {
	return createInfiniteQuery<
		InfiniteUnitsPage,
		Error,
		InfiniteData<InfiniteUnitsPage>,
		ReturnType<typeof keys.units.dataView>,
		number
	>(() => {
		const { complexId, search } = params();
		const trimmedSearch = search?.trim();

		return {
			queryKey: keys.units.dataView(complexId, trimmedSearch),
			initialPageParam: 0,
			getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
			queryFn: ({ pageParam }) =>
				api.complex.units.getPaginated({
					complexId,
					search: trimmedSearch || undefined,
					limit: DATA_VIEW_PAGE_SIZE,
					offset: typeof pageParam === 'number' ? pageParam : 0
				})
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
			await invalidateComplexAndContractData(client);

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
			await invalidateComplexAndContractData(client);

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
			await invalidateComplexAndContractData(client);

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
		onSuccess: async (_created) => {
			await invalidateComplexUnitsAndContractData(client);

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
		onSuccess: async (_updated) => {
			await invalidateComplexUnitsAndContractData(client);

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
				await invalidateComplexUnitsAndContractData(client);
			}

			onMutationSuccess(opts);
		},
		onError: (e) => onMutationError(opts, e)
	}));
}
