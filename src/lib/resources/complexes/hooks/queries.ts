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
	units: {
		all: ['complexes', 'units'],
		get: (id: number) => ['complexes', 'units', 'detail', id],
		getMany: (complexId: number) => ['complexes', 'units', complexId]
	}
} as const;

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
			client.invalidateQueries({ queryKey: ['contracts', 'dashboard'] });

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
			client.invalidateQueries({ queryKey: ['contracts', 'dashboard'] });

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
			client.invalidateQueries({ queryKey: ['contracts', 'dashboard'] });

			onMutationSuccess(opts);
		},
		onError: (e) => onMutationError(opts, e)
	}));
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
			client.invalidateQueries({ queryKey: keys.units.all });
			client.invalidateQueries({ queryKey: keys.units.getMany(created.complexId) });
			client.invalidateQueries({ queryKey: ['contracts', 'dashboard'] });

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
			client.invalidateQueries({ queryKey: keys.units.all });
			client.invalidateQueries({ queryKey: keys.units.getMany(updated.complexId) });
			client.invalidateQueries({ queryKey: ['contracts', 'dashboard'] });

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
				client.invalidateQueries({ queryKey: keys.units.all });
				client.invalidateQueries({ queryKey: keys.units.getMany(deleted.complexId) });
				client.invalidateQueries({ queryKey: ['contracts', 'dashboard'] });
			}

			onMutationSuccess(opts);
		},
		onError: (e) => onMutationError(opts, e)
	}));
}
