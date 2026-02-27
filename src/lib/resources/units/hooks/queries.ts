import api from '$lib/api/mod';
import {
	type MutationOptions,
	onMutationError,
	onMutationSuccess
} from '$lib/common/utils/queries';
import { createMutation, createQuery, useQueryClient } from '@tanstack/svelte-query';

export const keys = {
	all: ['units'],
	get: (id: number) => ['units', id],
	getMany: (complexId: number) => ['complexes', 'units', complexId]
};

export function useFetchUnit(id: () => number) {
	return createQuery(() => {
		const freshId = id();

		return {
			queryKey: keys.get(freshId),
			queryFn: () => api.complex.units.getMany({ complexId: freshId })
		};
	});
}

export function useFetchUnits(complexId: () => number) {
	return createQuery(() => {
		const id = complexId();

		return {
			queryKey: keys.getMany(id),
			queryFn: () => api.complex.units.getMany({ complexId: id })
		};
	});
}

export function useCreateUnit(
	opts: MutationOptions = {
		toast: {
			success: 'unit created successfully!',
			error: false,
			unexpected: 'unexpected error occurred!'
		}
	}
) {
	const client = useQueryClient();

	return createMutation(() => ({
		mutationFn: (data: Parameters<typeof api.complex.units.create>[0]) =>
			api.complex.units.create(data),
		onSuccess: (created) => {
			client.invalidateQueries({ queryKey: keys.all });
			client.invalidateQueries({ queryKey: keys.getMany(created.complexId) });

			onMutationSuccess(opts);
		},
		onError: (e) => onMutationError(opts, e)
	}));
}

export function useUpdateUnit(
	opts: MutationOptions = {
		toast: {
			success: 'unit updated successfully!',
			error: false,
			unexpected: 'unexpected error occurred!'
		}
	}
) {
	const client = useQueryClient();

	return createMutation(() => ({
		mutationFn: (values: Parameters<typeof api.complex.units.update>[0]) =>
			api.complex.units.update(values),
		onSuccess: (updated) => {
			client.invalidateQueries({ queryKey: keys.all });
			client.invalidateQueries({ queryKey: keys.getMany(updated.complexId) });

			onMutationSuccess(opts);
		},
		onError: (e) => onMutationError(opts, e)
	}));
}

export function useDeleteUnit(
	opts: MutationOptions = {
		toast: {
			success: 'unit deleted successfully!',
			error: false,
			unexpected: 'unexpected error occurred!'
		}
	}
) {
	const client = useQueryClient();

	return createMutation(() => ({
		mutationFn: (id: number) => api.complex.units.delete({ id }),
		onSuccess: (deleted) => {
			if (deleted) {
				client.invalidateQueries({ queryKey: keys.all });
				client.invalidateQueries({ queryKey: keys.getMany(deleted.complexId) });
			}

			onMutationSuccess(opts);
		},
		onError: (e) => onMutationError(opts, e)
	}));
}
