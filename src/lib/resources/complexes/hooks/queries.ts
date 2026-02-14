import api from '$lib/api/mod';
import {
	onMutationError,
	onMutationSuccess,
	type MutationOptions
} from '$lib/common/utils/queries';
import { createMutation, createQuery, useQueryClient } from '@tanstack/svelte-query';

export const keys = {
	all: ['complexes'],
	get: (id: number) => ['complexes', id],
	getUnits: (complexId: number) => ['complexes', 'units', complexId]
};

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

export function useCreateComplex(
	opts: MutationOptions = {
		toast: {
			success: 'complex created successfully!',
			error: false,
			unexpected: 'unexpected error occurred!'
		}
	}
) {
	const client = useQueryClient();

	return createMutation(() => ({
		mutationFn: (data: Parameters<typeof api.complex.create>[0]) => api.complex.create(data),
		onSuccess: () => {
			client.invalidateQueries({ queryKey: keys.all });

			onMutationSuccess(opts);
		},
		onError: (e) => onMutationError(opts, e)
	}));
}

export function useUpdateComplex(
	opts: MutationOptions = {
		toast: {
			success: 'complex updated successfully!',
			error: false,
			unexpected: 'unexpected error occurred!'
		}
	}
) {
	const client = useQueryClient();

	return createMutation(() => ({
		mutationFn: (values: Parameters<typeof api.complex.update>[0]) => api.complex.update(values),
		onSuccess: () => {
			client.invalidateQueries({ queryKey: keys.all });

			onMutationSuccess(opts);
		},
		onError: (e) => onMutationError(opts, e)
	}));
}

export function useDeleteComplex(
	opts: MutationOptions = {
		toast: {
			success: 'complex deleted successfully!',
			error: false,
			unexpected: 'unexpected error occurred!'
		}
	}
) {
	const client = useQueryClient();

	return createMutation(() => ({
		mutationFn: (id: number) => api.complex.delete({ id }),
		onSuccess: () => {
			client.invalidateQueries({ queryKey: keys.all });

			onMutationSuccess(opts);
		},
		onError: (e) => onMutationError(opts, e)
	}));
}
